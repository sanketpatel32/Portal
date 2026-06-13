import { cn } from "@/lib/utils";
import { fieldClass, panelClass, textareaClass } from "@/lib/form-styles";

export { panelClass, fieldClass, textareaClass };

export const labelSmClass =
  "font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500";

export const monoInputSmClass = cn(
  fieldClass,
  "px-3 py-2 text-[13px] font-mono"
);

export const codeTextareaClass = cn(
  textareaClass,
  "min-h-[180px] flex-1 text-[13px] leading-relaxed"
);

export const codeTextareaLgClass = cn(
  codeTextareaClass,
  "min-h-[240px] text-base"
);

export const interactiveRowClass =
  "border border-white/10 bg-white/[0.03] p-4 transition-app motion-hover-lift motion-press hover:border-white/15 hover:bg-white/[0.05] cursor-pointer";

export const interactiveCardClass =
  "border border-white/10 bg-white/[0.03] p-4 transition-app motion-hover-lift motion-press hover:border-white/15";

export const toolMainClass = "flex min-h-0 flex-1 flex-col overflow-hidden";

export const toolScrollClass = "min-h-0 flex-1 overflow-y-auto overflow-x-hidden";

export const toolSplitGridClass =
  "grid min-h-0 flex-1 gap-4 max-lg:overflow-y-auto lg:grid-cols-2 lg:overflow-hidden";

export const toolPanelClass = cn(
  panelClass,
  "flex min-h-0 flex-col overflow-hidden p-4"
);

export const sectionLabelClass =
  "font-mono text-[13px] uppercase tracking-[0.22em] text-zinc-500";

export const metaTextClass =
  "font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600";

export const formatToggleClass = (active: boolean) =>
  cn(
    "border px-3 py-1.5 font-mono text-[13px] uppercase tracking-wider transition-app motion-press",
    active
      ? "border-white bg-white text-black"
      : "border-white/10 text-zinc-500 hover:border-white/30 hover:text-white"
  );

export const chipButtonClass = (active: boolean) =>
  cn(
    "inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-[13px] uppercase tracking-wider transition-app motion-press",
    active
      ? "border-white bg-white text-black"
      : "border-white/10 text-zinc-500 hover:border-white/30 hover:text-white"
  );

export const preOutputClass =
  "min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-zinc-300";

export const tableScrollClass = "min-h-0 flex-1 overflow-auto";

export const dataTableClass =
  "w-full border-collapse font-mono text-[13px] text-zinc-300";

export const dataThClass =
  "sticky top-0 border-b border-white/10 bg-black px-4 py-2 text-left font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500";

export const dataTdClass = "border-b border-white/5 px-4 py-2.5 align-top";
