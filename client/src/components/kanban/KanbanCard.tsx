import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { interactiveCardClass } from "@/lib/ui-classes";
import type { KanbanTask } from "./types";

interface KanbanCardProps {
	task: KanbanTask;
	/** Compact single-line variant used in lists (default false). */
	compact?: boolean;
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
			// Entire card is the drag surface — no separate handle. Action buttons
			// below stop propagation so their clicks never start a drag.
			{...(dragOverlay ? {} : attributes)}
			{...(dragOverlay ? {} : listeners)}
			className={cn(
				interactiveCardClass,
				"group/card relative flex min-h-[44px] cursor-grab items-start gap-2 rounded px-3 py-2.5 touch-none",
				invisible && "opacity-30",
				dragOverlay &&
					"cursor-grabbing border-white/40 shadow-lg shadow-black/40 rotate-1",
			)}
		>
			<div className="min-w-0 flex-1">
				<p
					className={cn(
						"text-zinc-200",
						compact
							? "truncate text-[13px]"
							: "line-clamp-2 break-words text-[13.5px]",
					)}
				>
					{task.title}
				</p>
				<p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-zinc-600">
					{formatTimestamp(task.updatedAt)}
				</p>
			</div>

			{/* Hover actions. They stop the dnd-kit pointer listeners so clicks on the
          delete button never initiate a drag. */}
			{onDelete && (
				<button
					type="button"
					title="Delete"
					aria-label="Delete task"
					onClick={onDelete}
					onPointerDown={(e) => e.stopPropagation()}
					className="z-10 flex size-7 shrink-0 items-center justify-center text-zinc-500 opacity-0 transition-app hover:text-red-400 group-hover/card:opacity-100"
				>
					<Trash2 className="size-3.5" strokeWidth={1.5} />
				</button>
			)}
		</div>
	);
};
