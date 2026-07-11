import React, { useMemo, useRef, useState } from "react";
import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	closestCorners,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Eraser } from "lucide-react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { ModuleShell } from "./ui/ModuleShell";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { AppButton } from "./ui/AppButton";
import {
	COLUMN_ORDER,
	makeId,
	migrateTasks,
	type KanbanStatus,
	type KanbanTask,
} from "./kanban/types";
import { KanbanColumn } from "./kanban/KanbanColumn";
import { TodoClipboardPanel } from "./kanban/TodoClipboardPanel";
import { KanbanCard } from "./kanban/KanbanCard";

type Props = {
	/** Accepted for prop-shape consistency with sibling modules; unused (board is local-only). */
	token: string;
	onBack: () => void;
	playBeep: (type: "success" | "error" | "click") => void;
};

function isContainerId(id: string): boolean {
	return (COLUMN_ORDER as string[]).includes(id);
}

export const KanbanBoard: React.FC<Props> = ({ onBack, playBeep: beep }) => {
	// One persisted array holds the entire board state.
	const [tasks, setTasks] = usePersistentState<KanbanTask[]>(
		"auraflow_kanban_tasks",
		[],
		migrateTasks,
	);

	// Ref mirror so DnD handlers (fired in rapid succession during a drag) always
	// read fresh state instead of a stale render closure.
	const tasksRef = useRef(tasks);
	tasksRef.current = tasks;

	const [activeId, setActiveId] = useState<string | null>(null);
	const activeTask = useMemo(
		() => (activeId ? (tasks.find((t) => t.id === activeId) ?? null) : null),
		[activeId, tasks],
	);

	// Activation constraint so clicks on card action buttons don't start a drag.
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// --- Derived buckets (board columns) ------------------------------------
	const byStatus = useMemo(() => {
		const map: Record<KanbanStatus, KanbanTask[]> = {
			todo: [],
			progress: [],
			completed: [],
		};
		for (const t of tasks) map[t.status]?.push(t);
		return map;
	}, [tasks]);

	const activeCount = byStatus.todo.length + byStatus.progress.length;

	// --- Operations ---------------------------------------------------------
	// New tasks land directly on To Do — no inbox/backlog step.
	const addTasks = (titles: string[]) => {
		const now = Date.now();
		setTasks((prev) => [
			...prev,
			...titles.map<KanbanTask>((title) => ({
				id: makeId(),
				title,
				status: "todo",
				createdAt: now,
				updatedAt: now,
			})),
		]);
	};

	const deleteTask = (id: string) => {
		setTasks((prev) => prev.filter((t) => t.id !== id));
	};

	const [confirmClear, setConfirmClear] = useState(false);

	const clearCompleted = () => {
		if (byStatus.completed.length === 0) return;
		setConfirmClear(true);
	};

	const performClearCompleted = () => {
		setTasks((prev) => prev.filter((t) => t.status !== "completed"));
		setConfirmClear(false);
	};

	// --- DnD helpers --------------------------------------------------------
	const findContainer = (id: string): KanbanStatus | undefined => {
		if (isContainerId(id)) return id as KanbanStatus;
		return tasksRef.current.find((t) => t.id === id)?.status;
	};

	const handleDragStart = (e: DragStartEvent) => {
		setActiveId(String(e.active.id));
	};

	// Live cross-container move so the card visibly hops columns mid-drag.
	const handleDragOver = (e: DragOverEvent) => {
		const { active, over } = e;
		if (!over) return;
		const activeIdStr = String(active.id);
		const overIdStr = String(over.id);

		const activeContainer = findContainer(activeIdStr);
		const overContainer = findContainer(overIdStr);
		if (!activeContainer || !overContainer) return;
		if (activeContainer === overContainer) return;

		setTasks((prev) =>
			prev.map((t) =>
				t.id === activeIdStr
					? { ...t, status: overContainer, updatedAt: Date.now() }
					: t,
			),
		);
	};

	const handleDragEnd = (e: DragEndEvent) => {
		const { active, over } = e;
		setActiveId(null);
		if (!over) return;

		const activeIdStr = String(active.id);
		const overIdStr = String(over.id);
		const activeContainer = findContainer(activeIdStr);
		const overContainer = findContainer(overIdStr);
		if (!activeContainer || !overContainer) return;

		if (activeContainer === overContainer && activeIdStr !== overIdStr) {
			// Same-column reorder.
			setTasks((prev) => {
				const oldIndex = prev.findIndex((t) => t.id === activeIdStr);
				const newIndex = prev.findIndex((t) => t.id === overIdStr);
				if (oldIndex === -1 || newIndex === -1) return prev;
				const moved = arrayMove(prev, oldIndex, newIndex);
				return moved.map((t) =>
					t.id === activeIdStr ? { ...t, updatedAt: Date.now() } : t,
				);
			});
		} else if (activeContainer !== overContainer) {
			// Cross-container was already applied live in onDragOver; just stamp the time.
			setTasks((prev) =>
				prev.map((t) =>
					t.id === activeIdStr
						? { ...t, status: overContainer, updatedAt: Date.now() }
						: t,
				),
			);
		}
	};

	const handleDragCancel = () => setActiveId(null);

	return (
		<ModuleShell variant="tool" maxWidth="7xl">
			<ModuleHeaderBar
				title="Kanban Board"
				meta={
					<span className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-600">
						{activeCount} active
					</span>
				}
				actions={
					<AppButton
						variant="ghostSm"
						onClick={clearCompleted}
						disabled={byStatus.completed.length === 0}
						icon={<Eraser className="size-3.5" strokeWidth={1.5} />}
					>
						Clear Done
					</AppButton>
				}
				onBack={() => {
					beep("click");
					onBack();
				}}
				backLabel="Dashboard"
			/>

			<DndContext
				sensors={sensors}
				collisionDetection={closestCorners}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
				onDragCancel={handleDragCancel}
			>
				<div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
					{/* ~80% — the board */}
					<div className="flex min-h-0 basis-full gap-3 overflow-x-auto pb-1 lg:basis-4/5">
						{COLUMN_ORDER.map((status) => (
							<KanbanColumn
								key={status}
								status={status}
								tasks={byStatus[status]}
								onDelete={deleteTask}
							/>
						))}
					</div>

					{/* ~20% — copyable To Do list */}
					<aside className="flex min-h-0 basis-full flex-col lg:basis-1/5 lg:min-w-[260px]">
						<TodoClipboardPanel
							tasks={byStatus.todo}
							onAdd={addTasks}
							onBeep={beep}
						/>
					</aside>
				</div>

				<DragOverlay dropAnimation={null}>
					{activeTask ? <KanbanCard task={activeTask} dragOverlay /> : null}
				</DragOverlay>
			</DndContext>
			<ConfirmDialog
				open={confirmClear}
				title="Clear completed tasks"
				message={`Delete ${byStatus.completed.length} completed task(s)?`}
				confirmLabel="Delete"
				variant="danger"
				onCancel={() => setConfirmClear(false)}
				onConfirm={performClearCompleted}
			/>
		</ModuleShell>
	);
};
