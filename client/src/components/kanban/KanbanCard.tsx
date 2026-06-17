import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, GripVertical, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { interactiveCardClass } from "@/lib/ui-classes";
import type { KanbanStatus, KanbanTask } from "./types";

interface KanbanCardProps {
  task: KanbanTask;
  /** Compact single-line variant used in the backlog list (default false). */
  compact?: boolean;
  /** When provided, renders a small promote arrow that calls this handler (no-drag alt). */
  onPromote?: () => void;
  /** Icon label shown on the promote button (defaults to "To board"). */
  promoteLabel?: string;
  /** Target status the promote button moves to (used for aria-label). */
  promoteTo?: KanbanStatus;
  onDelete?: () => void;
  /** Render as a plain clone (no sortable wiring) — used by the DragOverlay. */
  dragOverlay?: boolean;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  task,
  compact = false,
  onPromote,
  promoteLabel = "To board",
  promoteTo,
  onDelete,
  dragOverlay = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: dragOverlay });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  // Hide the source while dragging so the DragOverlay clone is the only visible copy.
  const invisible = isDragging && !dragOverlay;

  return (
    <div
      ref={dragOverlay ? undefined : setNodeRef}
      style={dragOverlay ? undefined : style}
      className={cn(
        interactiveCardClass,
        "group/card relative flex min-h-[44px] items-start gap-2 rounded px-3 py-2.5",
        invisible && "opacity-30",
        dragOverlay && "border-white/40 shadow-lg shadow-black/40 rotate-1"
      )}
    >
      {/* Drag handle — the ONLY element that initiates a drag. Standard @dnd-kit
          "handle drag" pattern, which keeps inner action buttons fully clickable. */}
      <button
        type="button"
        aria-label="Drag task"
        className={cn(
          "mt-0.5 flex size-6 shrink-0 cursor-grab items-center justify-center text-zinc-600 transition-app hover:text-zinc-300 active:cursor-grabbing",
          compact && "size-5"
        )}
        {...(dragOverlay ? {} : attributes)}
        {...(dragOverlay ? {} : listeners)}
      >
        <GripVertical className={compact ? "size-3" : "size-3.5"} strokeWidth={1.5} />
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-zinc-200",
            compact
              ? "truncate text-[13px]"
              : "line-clamp-2 break-words text-[13.5px]"
          )}
        >
          {task.title}
        </p>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-zinc-600">
          {formatTimestamp(task.updatedAt)}
        </p>
      </div>

      {/* Hover actions. They live outside the drag handle so clicks never start a drag. */}
      <div className="z-10 flex shrink-0 items-center gap-0.5 opacity-0 transition-app group-hover/card:opacity-100">
        {onPromote && (
          <button
            type="button"
            title={promoteLabel}
            aria-label={`${promoteLabel}${promoteTo ? `: ${promoteTo}` : ""}`}
            onClick={onPromote}
            className="flex size-7 items-center justify-center text-zinc-500 transition-app hover:text-white"
          >
            <ArrowRight className="size-3.5" strokeWidth={1.5} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            title="Delete"
            aria-label="Delete task"
            onClick={onDelete}
            className="flex size-7 items-center justify-center text-zinc-500 transition-app hover:text-red-400"
          >
            <Trash2 className="size-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
};
