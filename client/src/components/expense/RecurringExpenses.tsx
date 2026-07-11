import { Trash2 } from "lucide-react";
import {
  TYPE_LABELS,
  formatCurrency,
  formatRecurringDuration,
  type RecurringExpense,
} from "./shared";
import { deleteRecurringExpense } from "./api";
import { useAuthHeaders } from "@/hooks/useAuthHeaders";

type Props = {
  token: string;
  recurring: RecurringExpense[];
  loading: boolean;
  playBeep: (type: "success" | "error" | "click") => void;
  onChanged: () => void;
};

export function RecurringExpensesList({ token, recurring, loading, playBeep, onChanged }: Props) {
  const apiHeaders = useAuthHeaders(token);

  const handleDelete = async (id: string) => {
    const ok = await deleteRecurringExpense(id, apiHeaders);
    if (ok) {
      playBeep("click");
      onChanged();
    } else {
      playBeep("error");
    }
  };

  if (loading) {
    return <div className="h-12 animate-pulse rounded bg-white/[0.04]" />;
  }

  if (recurring.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {recurring.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded border border-white/[0.06] bg-black/20 px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-zinc-200">
              {item.description || item.category || TYPE_LABELS[item.type]}
            </p>
            <p className="font-mono text-[10px] text-zinc-600">
              {new Date(item.startDate).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {" · "}
              {formatRecurringDuration(item.monthCount)}
              {" · "}
              {TYPE_LABELS[item.type]}
              {item.category ? ` · ${item.category}` : ""}
            </p>
          </div>
          <span className="font-mono text-sm tabular-nums text-white">{formatCurrency(item.amount)}</span>
          <button
            type="button"
            onClick={() => handleDelete(item.id)}
            className="text-zinc-700 hover:text-red-400"
            aria-label="Delete recurring expense"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
