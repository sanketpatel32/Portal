import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/lib/form-styles";
import { monoInputSmClass } from "@/lib/ui-classes";

export type SearchableMultiSelectOption = {
  value: string;
  label: string;
};

type SearchableMultiSelectProps = {
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: SearchableMultiSelectOption[] | string[];
  placeholder?: string;
  className?: string;
  inputSize?: "md" | "sm";
  disabled?: boolean;
};

function normalizeOptions(
  options: SearchableMultiSelectOption[] | string[],
): SearchableMultiSelectOption[] {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

/**
 * Multi-select dropdown with a built-in search box.
 *
 * Modeled on SearchableSelect (same styling tokens, outside-click handling,
 * keyboard nav) but toggles many values instead of picking one. Selected
 * options are pinned to the top of the list with a check, and render as
 * removable chips below the trigger so the current selection stays visible.
 *
 * The panel never pushes page layout: it's absolutely positioned over the
 * trigger, so a tall option list doesn't grow the surrounding form.
 */
export function SearchableMultiSelect({
  values,
  onValuesChange,
  options,
  placeholder = "Select options",
  className,
  inputSize = "sm",
  disabled = false,
}: SearchableMultiSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const selectedSet = useMemo(() => new Set(values), [values]);

  // Selected items float to the top (stable within each group), so the user
  // always sees what they've picked without hunting through a long list.
  const filteredOptions = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    const matches = trimmed
      ? normalizedOptions.filter(
          (option) =>
            option.label.toLowerCase().includes(trimmed) ||
            option.value.toLowerCase().includes(trimmed),
        )
      : normalizedOptions;
    return [...matches].sort((a, b) => {
      const aSel = selectedSet.has(a.value) ? 0 : 1;
      const bSel = selectedSet.has(b.value) ? 0 : 1;
      return aSel - bSel;
    });
  }, [normalizedOptions, search, selectedSet]);

  const closeMenu = () => {
    setOpen(false);
    setSearch("");
    setActiveIndex(0);
  };

  // Click-away / escape-to-close. Mirrors SearchableSelect.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filteredOptions.length) {
      setActiveIndex(Math.max(0, filteredOptions.length - 1));
    }
  }, [activeIndex, filteredOptions.length]);

  const toggleValue = (value: string) => {
    onValuesChange(
      selectedSet.has(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  };

  const removeValue = (value: string) => {
    onValuesChange(values.filter((v) => v !== value));
  };

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, Math.max(filteredOptions.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
      // Toggle without closing — that's the point of a multi-select.
      event.preventDefault();
      toggleValue(filteredOptions[activeIndex].value);
      return;
    }
  };

  const triggerClass = cn(
    inputSize === "sm" ? monoInputSmClass : fieldClass,
    "cursor-pointer pr-10",
    disabled && "cursor-not-allowed opacity-50",
  );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => (open ? closeMenu() : openMenu())}
          className={cn(triggerClass, "flex items-center justify-between text-left")}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
        >
          <span className={cn("truncate", values.length === 0 && "text-zinc-600")}>
            {values.length === 0
              ? placeholder
              : `${values.length} selected`}
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")}
            strokeWidth={1.75}
          />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 border border-[var(--border-subtle)] bg-[var(--surface-input)] shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
            <div className="border-b border-white/5 p-2">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search…"
                className={cn(monoInputSmClass, "border-white/10")}
              />
            </div>
            <ul
              id={listboxId}
              role="listbox"
              aria-multiselectable
              className="max-h-56 overflow-y-auto py-1"
            >
              {filteredOptions.length === 0 ? (
                <li className="px-4 py-3 text-sm text-zinc-500">No matches</li>
              ) : (
                filteredOptions.map((option, index) => {
                  const isSelected = selectedSet.has(option.value);
                  const isActive = index === activeIndex;
                  return (
                    <li
                      key={option.value || option.label}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => toggleValue(option.value)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm text-white transition-colors",
                        isActive && "bg-white/10",
                        !isActive && "hover:bg-white/[0.06]",
                      )}
                    >
                      <Check
                        className={cn(
                          "size-3.5 shrink-0",
                          isSelected ? "text-white" : "text-transparent",
                        )}
                        strokeWidth={2}
                      />
                      <span className="truncate">{option.label}</span>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Selected chips — kept below the trigger so the current selection is
          always visible and individually removable, even when the dropdown is
          closed. */}
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((value) => {
            const label =
              normalizedOptions.find((o) => o.value === value)?.label ?? value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => removeValue(value)}
                className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.04] px-2 py-1 font-mono text-[13px] text-white transition-app hover:border-red-500/40 hover:text-red-300"
                title={`Remove ${label}`}
              >
                {label}
                <X className="size-3" strokeWidth={1.5} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
