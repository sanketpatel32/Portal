import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/lib/form-styles";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[] | string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function normalizeOptions(options: SearchableSelectOption[] | string[]): SearchableSelectOption[] {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select an option",
  className,
  disabled = false,
}: SearchableSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const selectedOption = normalizedOptions.find((option) => option.value === value);

  const filteredOptions = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) {
      return normalizedOptions;
    }
    return normalizedOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(trimmed) ||
        option.value.toLowerCase().includes(trimmed),
    );
  }, [normalizedOptions, search]);

  const closeMenu = () => {
    setOpen(false);
    setSearch("");
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filteredOptions.length) {
      setActiveIndex(Math.max(0, filteredOptions.length - 1));
    }
  }, [activeIndex, filteredOptions.length]);

  const selectOption = (option: SearchableSelectOption) => {
    onValueChange(option.value);
    closeMenu();
    inputRef.current?.blur();
  };

  const openMenu = () => {
    if (disabled) {
      return;
    }
    setOpen(true);
    setSearch(selectedOption?.label ?? "");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, Math.max(filteredOptions.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      selectOption(filteredOptions[activeIndex]);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          disabled={disabled}
          value={open ? search : (selectedOption?.label ?? "")}
          placeholder={placeholder}
          onFocus={openMenu}
          onChange={(event) => {
            setOpen(true);
            setSearch(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          className={cn(
            fieldClass,
            "pr-10",
            disabled && "cursor-not-allowed opacity-50",
            !open && !selectedOption && "text-zinc-600",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              closeMenu();
              inputRef.current?.blur();
            } else {
              openMenu();
            }
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-white disabled:opacity-50"
          aria-label="Toggle options"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            strokeWidth={1.75}
          />
        </button>
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-56 overflow-y-auto border border-[var(--border-subtle)] bg-[var(--surface-input)] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        >
          {filteredOptions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-zinc-500">No matches</li>
          ) : (
            filteredOptions.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <li
                  key={option.value || option.label}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                  className={cn(
                    "cursor-pointer px-4 py-2.5 text-sm text-white transition-colors",
                    isActive && "bg-white/10",
                    !isActive && "hover:bg-white/[0.06]",
                  )}
                >
                  {option.label}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
