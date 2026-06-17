import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { SectionHeader } from "../ui/SectionHeader";
import { EmptyState } from "../ui/EmptyState";
import { COLUMN_META, type KanbanStatus, type KanbanTask } from "./types";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  status: KanbanStatus;
  tasks: KanbanTask[];
  onDelete: (id: string) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  status,
  tasks,
  onDelete,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = COLUMN_META[status];
  const Icon = meta.icon;

  return (
    <section className="flex min-h-0 w-[280px] shrink-0 flex-col lg:w-auto lg:flex-1">
      <SectionHeader
        title={meta.label}
        icon={<Icon className="size-3.5" strokeWidth={1.5} />}
        count={tasks.length}
      />
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded border border-white/10 bg-black/20 p-2.5 transition-app",
          isOver && "border-white/40 bg-white/[0.04]"
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 ? (
            <EmptyState
              compact
              icon={<Icon className="size-6" strokeWidth={1} />}
              message="No tasks"
              className="flex-1"
            />
          ) : (
            tasks.map((task) => (
              <KanbanCard key={task.id} task={task} onDelete={() => onDelete(task.id)} />
            ))
          )}
        </SortableContext>
      </div>
    </section>
  );
};
