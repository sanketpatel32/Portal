import React, { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Inbox, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistentState } from "@/hooks/usePersistentState";
import { SectionHeader } from "../ui/SectionHeader";
import { EmptyState } from "../ui/EmptyState";
import { AppInput } from "../ui/AppInput";
import { AppButton } from "../ui/AppButton";
import {
  BACKLOG_STATUS,
  parseMultiInput,
  type KanbanTask,
} from "./types";
import { KanbanCard } from "./KanbanCard";

interface BacklogPanelProps {
  tasks: KanbanTask[];
  onAdd: (titles: string[]) => void;
  onPromote: (id: string) => void;
  onDelete: (id: string) => void;
  onBeep: (type: "success" | "error" | "click") => void;
}

export const BacklogPanel: React.FC<BacklogPanelProps> = ({
  tasks,
  onAdd,
  onPromote,
  onDelete,
  onBeep,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: BACKLOG_STATUS });

  // Draft of the multi-add input persists across reopens — matches other modules.
  const [draft, setDraft] = usePersistentState<string>("auraflow_kanban_draft", "");

  const pendingCount = useMemo(() => parseMultiInput(draft).length, [draft]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const titles = parseMultiInput(draft);
    if (titles.length === 0) return;
    onAdd(titles);
    setDraft("");
    onBeep("success");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Top: scrollable backlog list */}
      <div className="flex min-h-0 flex-1 flex-col">
        <SectionHeader
          title="Backlog"
          icon={<Inbox className="size-3.5" strokeWidth={1.5} />}
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
                icon={<Inbox className="size-6" strokeWidth={1} />}
                message="Inbox empty"
                description="Add tasks below"
                className="flex-1"
              />
            ) : (
              tasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  compact
                  onPromote={() => onPromote(task.id)}
                  promoteLabel="Send to To Do"
                  promoteTo="todo"
                  onDelete={() => onDelete(task.id)}
                />
              ))
            )}
          </SortableContext>
        </div>
      </div>

      {/* Bottom: multi-add form */}
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 flex-col gap-2 rounded border border-white/10 bg-white/[0.03] p-3"
      >
        <AppInput
          inputSize="sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add tasks; separate with ;"
          aria-label="Add tasks"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-600">
            {pendingCount > 0 ? `${pendingCount} ready` : "optional"}
          </span>
          <AppButton
            type="submit"
            variant="ghostSm"
            disabled={pendingCount === 0}
            icon={<Plus className="size-3.5" strokeWidth={1.5} />}
          >
            Add
          </AppButton>
        </div>
      </form>
    </div>
  );
};
