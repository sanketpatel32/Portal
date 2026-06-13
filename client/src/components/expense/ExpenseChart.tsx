import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  type ChartGroupBy,
  type ChartPoint,
  chartBarColor,
  chartPointLabel,
  formatCurrency,
} from "./shared";

type Props = {
  series: ChartPoint[];
  groupBy: ChartGroupBy;
  loading?: boolean;
};

export function ExpenseChart({ series, groupBy, loading }: Props) {
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);

  if (loading) {
    return (
      <div className="flex h-44 items-end gap-1.5 px-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex-1 animate-pulse rounded-t bg-white/[0.06]" style={{ height: `${30 + (i % 4) * 12}%` }} />
        ))}
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <p className="py-10 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-600">
        No data for this period
      </p>
    );
  }

  const max = Math.max(...series.map((p) => p.total), 1);
  const chartHeight = 140;

  return (
    <div className="space-y-4">
      {/* Chart container with absolute horizontal grid lines */}
      <div className="relative" style={{ minHeight: chartHeight + 28 }}>
        {/* Horizontal grid lines overlay */}
        <div 
          className="absolute left-0 right-0 pointer-events-none flex flex-col justify-between" 
          style={{ height: chartHeight, bottom: 28 }}
        >
          <div className="w-full border-t border-white/[0.03]" />
          <div className="w-full border-t border-white/[0.03]" />
          <div className="w-full border-t border-white/[0.03]" />
          <div className="w-full border-t border-white/[0.03]" />
        </div>

        {/* Scrollable bars list */}
        <div className="relative z-10 flex items-end gap-1.5 overflow-x-auto pb-1" style={{ minHeight: chartHeight + 28 }}>
          {series.map((point) => {
            const height = Math.max(4, Math.round((point.total / max) * chartHeight));
            const color = chartBarColor(point._id, groupBy);
            const isHovered = hoveredPoint?._id === point._id;
            
            return (
              <div
                key={point._id}
                className="flex min-w-[2.25rem] flex-1 flex-col items-center gap-2 cursor-pointer"
                onMouseEnter={() => setHoveredPoint(point)}
                onMouseLeave={() => setHoveredPoint(null)}
                onTouchStart={() => setHoveredPoint(point)}
                onTouchEnd={() => setHoveredPoint(null)}
              >
                <span 
                  className={cn(
                    "font-mono text-[9px] tabular-nums transition-colors duration-150",
                    isHovered ? "text-white font-medium" : "text-zinc-600"
                  )}
                >
                  {point.total >= 1000 ? `${Math.round(point.total / 1000)}k` : point.total}
                </span>
                <div
                  className="w-full rounded-t transition-all duration-300"
                  style={{ 
                    height, 
                    backgroundColor: color, 
                    opacity: hoveredPoint 
                      ? (isHovered ? 1 : 0.4) 
                      : (groupBy === "day" ? 0.85 : 1) 
                  }}
                />
                <span 
                  className={cn(
                    "max-w-full truncate font-mono text-[9px] uppercase tracking-[0.08em] transition-colors duration-150",
                    isHovered ? "text-white font-medium" : "text-zinc-500"
                  )}
                >
                  {chartPointLabel(point._id, groupBy)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monospaced HUD Telemetry console line */}
      <div className="h-6 flex items-center justify-between border-t border-white/[0.08] pt-3 font-mono text-[10px] uppercase tracking-widest">
        {hoveredPoint ? (
          <div className="flex gap-4 w-full justify-between items-center text-white animate-scale-up">
            <span className="text-zinc-500">
              Selected: <span className="text-white">{chartPointLabel(hoveredPoint._id, groupBy)}</span>
            </span>
            <span>
              Total: <span className="text-white">{formatCurrency(hoveredPoint.total)}</span>
            </span>
            <span className="hidden xs:inline">
              Txs: <span className="text-white">{hoveredPoint.count}</span>
            </span>
          </div>
        ) : (
          <div className="flex gap-4 w-full justify-between items-center text-zinc-600">
            <span>Peak: {formatCurrency(max)}</span>
            <span>Total Entries: {series.reduce((s, p) => s + p.count, 0)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
