import React, { useMemo } from "react";
import { ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistentState } from "@/hooks/usePersistentState";
import { SectionHeader } from "../ui/SectionHeader";
import { EmptyState } from "../ui/EmptyState";
import { AppInput } from "../ui/AppInput";
import { AppButton } from "../ui/AppButton";
import { CopyButton } from "../ui/CopyButton";
import { parseMultiInput, type KanbanTask } from "./types";

interface TodoClipboardPanelProps {
	/** Every task currently in "todo" — rendered as one bullet each. */
	tasks: KanbanTask[];
	onAdd: (titles: string[]) => void;
	onBeep: (type: "success" | "error" | "click") => void;
}

/**
 * Read-only list of the current To Do items, one per line as plain bullets,
 * plus a one-click "Copy all" so the whole backlog can be pasted elsewhere.
 *
 * New items added here land directly on the To Do column (no inbox step).
 */
export const TodoClipboardPanel: React.FC<TodoClipboardPanelProps> = ({
	tasks,
	onAdd,
	onBeep,
}) => {
	// Draft of the multi-add input persists across reopens — matches other modules.
	const [draft, setDraft] = usePersistentState<string>(
		"auraflow_kanban_draft",
		"",
	);

	const pendingCount = useMemo(() => parseMultiInput(draft).length, [draft]);

	// One bullet per todo, joined as newlines so "Copy all" pastes cleanly.
	const allText = useMemo(
		() => tasks.map((t) => `- ${t.title}`).join("\n"),
		[tasks],
	);

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
			{/* Top: scrollable copyable todo list */}
			<div className="flex min-h-0 flex-1 flex-col">
				<SectionHeader
					title="To Do List"
					icon={<ListTodo className="size-3.5" strokeWidth={1.5} />}
					count={tasks.length}
					actions={
						tasks.length > 0 ? (
							<CopyButton
								text={allText}
								label="Copy"
								copiedLabel="Copied"
								className="min-h-[28px] px-2 py-0.5"
							/>
						) : undefined
					}
				/>
				<div
					className={cn(
						"flex min-h-0 flex-1 flex-col overflow-y-auto rounded border border-white/10 bg-black/20 p-2.5 transition-app",
					)}
				>
					{tasks.length === 0 ? (
						<EmptyState
							compact
							icon={<ListTodo className="size-6" strokeWidth={1} />}
							message="Nothing to do"
							description="Add tasks below"
							className="flex-1"
						/>
					) : (
						<ul className="flex flex-col gap-1.5">
							{tasks.map((task) => (
								<li
									key={task.id}
									className="group/item flex items-center gap-2 rounded px-1.5 py-1 transition-app hover:bg-white/[0.03]"
								>
									<span className="text-zinc-600">•</span>
									<span className="min-w-0 flex-1 truncate text-[13px] text-zinc-300">
										{task.title}
									</span>
									<CopyButton
										text={task.title}
										className="size-6 p-0.5 opacity-0 transition-app group-hover/item:opacity-100"
									/>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			{/* Bottom: multi-add form — items go straight to To Do */}
			<form
				onSubmit={handleSubmit}
				className="flex shrink-0 flex-col gap-2 rounded border border-white/10 bg-white/[0.03] p-3"
			>
				<AppInput
					inputSize="sm"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder="Add to To Do; separate with ;"
					aria-label="Add to To Do"
				/>
				<div className="flex items-center justify-between gap-2">
					<span className="font-mono text-[11px] uppercase tracking-wider text-zinc-600">
						{pendingCount > 0 ? `${pendingCount} ready` : "optional"}
					</span>
					<AppButton
						type="submit"
						variant="ghostSm"
						disabled={pendingCount === 0}
					>
						Add
					</AppButton>
				</div>
			</form>
		</div>
	);
};
