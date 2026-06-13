import React from "react";
import { playBeep } from "../../lib/audio";
import { cn } from "../../lib/utils";

interface Tab {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
  icon?: React.ReactNode;
}

interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  variant?: "underline" | "dot" | "chip";
  className?: string;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  active,
  onChange,
  variant = "underline",
  className,
}) => {
  return (
    <div
      className={cn(
        "flex select-none flex-wrap",
        variant === "underline" && "mb-4 w-full gap-2 border-b border-white/5",
        variant === "dot" && "mb-4 flex-wrap items-center gap-4",
        variant === "chip" && "mb-4 gap-1.5 rounded-md border border-white/5 bg-white/[0.02] p-1",
        className
      )}
    >
      {tabs.map((tab, i) => {
        const isActive = active === tab.id;
        const isDisabled = tab.disabled;

        const handleClick = () => {
          if (isDisabled) return;
          playBeep("click");
          onChange(tab.id);
        };

        if (variant === "dot") {
          return (
            <React.Fragment key={tab.id}>
              {i > 0 && (
                <span className="flex select-none items-center font-sans text-[13px] text-zinc-800">
                  &middot;
                </span>
              )}
              <button
                type="button"
                disabled={isDisabled}
                onClick={handleClick}
                className={cn(
                  "relative cursor-pointer py-1 font-mono text-[13px] uppercase tracking-[0.3em] transition-app focus:outline-none motion-press",
                  isActive
                    ? "scale-[1.02] font-semibold text-white"
                    : "text-zinc-600 hover:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-30"
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  {tab.icon}
                  {tab.label}
                </span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1.5 text-[13px] text-zinc-600">({tab.count})</span>
                )}
              </button>
            </React.Fragment>
          );
        }

        if (variant === "chip") {
          return (
            <button
              key={tab.id}
              type="button"
              disabled={isDisabled}
              onClick={handleClick}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 font-mono text-[13px] uppercase tracking-wider transition-app focus:outline-none motion-press",
                isActive
                  ? "bg-white font-semibold text-black"
                  : "text-zinc-500 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    "ml-1.5 rounded-sm px-1 py-0.5 text-[10px]",
                    isActive ? "bg-black/10 text-black" : "bg-white/5 text-zinc-500"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            disabled={isDisabled}
            onClick={handleClick}
            className={cn(
              "relative cursor-pointer border-b-2 border-transparent px-4 py-2 font-mono text-[13px] uppercase tracking-widest transition-app focus:outline-none motion-press",
              isActive
                ? "border-white font-semibold text-white"
                : "text-zinc-500 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                  isActive ? "bg-white text-black" : "bg-white/5 text-zinc-500"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
