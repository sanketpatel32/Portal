/**
 * Kanban board types + helpers.
 *
 * Single task type, title-only. Status flows:
 *   backlog (inbox) -> todo -> progress -> completed
 *
 * All state lives in one persisted `KanbanTask[]`. The board itself only shows
 * the 3 working columns (todo / progress / completed); "backlog" tasks live in
 * the side inbox and are promoted onto the board via drag or the promote button.
 */

import {
  Circle,
  CircleDot,
  CheckCircle2,
  Inbox,
  type LucideIcon,
} from "lucide-react";

export type KanbanStatus = "backlog" | "todo" | "progress" | "completed";

export interface KanbanTask {
  id: string;
  title: string;
  status: KanbanStatus;
  createdAt: number;
  updatedAt: number;
}

/** The 3 working columns rendered on the board (left 80%). Backlog is separate. */
export const COLUMN_ORDER: KanbanStatus[] = ["todo", "progress", "completed"];

export const BACKLOG_STATUS: KanbanStatus = "backlog";

interface ColumnMeta {
  label: string;
  icon: LucideIcon;
}

export const COLUMN_META: Record<KanbanStatus, ColumnMeta> = {
  backlog: { label: "Backlog", icon: Inbox },
  todo: { label: "To Do", icon: Circle },
  progress: { label: "In Progress", icon: CircleDot },
  completed: { label: "Completed", icon: CheckCircle2 },
};

/** Stable unique id with a Math.random fallback for non-secure contexts. */
export function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const VALID_STATUSES = new Set<KanbanStatus>([
  "backlog",
  "todo",
  "progress",
  "completed",
]);

/**
 * Parse the multi-add input. Splits on `;`, trims, drops empties, and de-dupes
 * case-insensitively within the batch so "Foo; foo; FOO" yields one "Foo".
 */
export function parseMultiInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(";")) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * validate() for usePersistentState. Coerces any stale/corrupt stored payload
 * into a clean KanbanTask[] so a schema change between releases can never crash
 * the board on load.
 */
export function migrateTasks(raw: unknown): KanbanTask[] {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const cleaned: KanbanTask[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const status = VALID_STATUSES.has(r.status as KanbanStatus)
      ? (r.status as KanbanStatus)
      : "backlog";
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!title) continue;
    let id = typeof r.id === "string" ? r.id : "";
    if (!id || ids.has(id)) id = makeId();
    ids.add(id);
    const createdAt = typeof r.createdAt === "number" ? r.createdAt : now;
    const updatedAt = typeof r.updatedAt === "number" ? r.updatedAt : createdAt;
    cleaned.push({ id, title, status, createdAt, updatedAt });
  }
  return cleaned;
}
