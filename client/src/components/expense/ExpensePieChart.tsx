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
};

const VIEWBOX = 200;
const CENTER = VIEWBOX / 2;
const OUTER_R = 80;
const INNER_R = 48;

type Slice = {
  point: ChartPoint;
  color: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(startAngle: number, endAngle: number, expand: number) {
  const r = OUTER_R + expand;
  const start = polar(CENTER, CENTER, r, endAngle);
  const end = polar(CENTER, CENTER, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  const innerStart = polar(CENTER, CENTER, INNER_R, endAngle);
  const innerEnd = polar(CENTER, CENTER, INNER_R, startAngle);
  return [
    `M ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_R} ${INNER_R} 0 ${largeArc} 1 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

export function ExpensePieChart({ series, groupBy }: Props) {
  const [hovered, setHovered] = useState<ChartPoint | null>(null);
  const [active, setActive] = useState<string | null>(null);

  if (series.length === 0) {
    return (
      <p className="py-10 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-600">
        No data for this period
      </p>
    );
  }

  const total = series.reduce((s, p) => s + p.total, 0);

  const slices: Slice[] = series.reduce(
    (acc: Slice[], point) => {
      const angle = (point.total / total) * 360;
      const startAngle = acc.length > 0 ? acc[acc.length - 1].endAngle : 0;
      const endAngle = startAngle + angle;
      return [
        ...acc,
        {
          point,
          color: chartBarColor(point._id, groupBy),
          startAngle,
          endAngle,
          midAngle: (startAngle + endAngle) / 2,
        },
      ];
    },
    []
  );

  const focused = hovered ?? slices.find((s) => s.point._id === active)?.point ?? null;
  const totalCount = series.reduce((s, p) => s + p.count, 0);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto shrink-0" style={{ width: VIEWBOX, height: VIEWBOX }}>
        <svg
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="size-full"
          onMouseLeave={() => setHovered(null)}
        >
          {slices.map(({ point, color, startAngle, endAngle, midAngle }) => {
            const isHovered = focused?._id === point._id;
            const isDimmed = focused !== null && !isHovered;
            const expand = isHovered ? 6 : 0;
            const labelPos = polar(CENTER, CENTER, OUTER_R + 16, midAngle);
            const showLabel = (point.total / total) >= 0.08;
            return (
              <g key={point._id}>
                <path
                  d={arcPath(startAngle, endAngle, expand)}
                  fill={color}
                  className="cursor-pointer transition-all duration-200"
                  style={{
                    opacity: isDimmed ? 0.35 : 1,
                    transformOrigin: `${CENTER}px ${CENTER}px`,
                  }}
                  onMouseEnter={() => setHovered(point)}
                  onClick={() => setActive(active === point._id ? null : point._id)}
                />
                {showLabel && (
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor={labelPos.x > CENTER + 4 ? "start" : labelPos.x < CENTER - 4 ? "end" : "middle"}
                    dominantBaseline="middle"
                    className={cn(
                      "pointer-events-none font-mono text-[7px] tabular-nums transition-opacity duration-200",
                      isHovered ? "fill-white opacity-100" : "fill-zinc-500 opacity-80"
                    )}
                  >
                    {Math.round((point.total / total) * 100)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {focused ? (
            <>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                {chartPointLabel(focused._id, groupBy)}
              </span>
              <span className="mt-0.5 font-mono text-lg tabular-nums text-white">
                {formatCurrency(focused.total)}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-zinc-600">
                {((focused.total / total) * 100).toFixed(1)}%
              </span>
            </>
          ) : (
            <>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Total
              </span>
              <span className="mt-0.5 font-mono text-lg tabular-nums text-white">
                {formatCurrency(total)}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-zinc-600">
                {totalCount} {totalCount === 1 ? "entry" : "entries"}
              </span>
            </>
          )}
        </div>
      </div>

      <ul className="flex w-full min-w-0 flex-1 flex-col gap-1.5">
        {slices
          .slice()
          .sort((a, b) => b.point.total - a.point.total)
          .map(({ point, color }) => {
            const isHovered = focused?._id === point._id;
            const isDimmed = focused !== null && !isHovered;
            const isActive = active === point._id;
            return (
              <li key={point._id}>
                <button
                  type="button"
                  onMouseEnter={() => setHovered(point)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setActive(isActive ? null : point._id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 border px-2.5 py-1.5 text-left transition-all duration-150",
                    isActive ? "border-white/30 bg-white/[0.06]" : "border-transparent hover:border-white/15 hover:bg-white/[0.03]",
                    isDimmed && "opacity-50"
                  )}
                >
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-300">
                    {chartPointLabel(point._id, groupBy)}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-white">
                    {formatCurrency(point.total)}
                  </span>
                  <span className="w-9 text-right font-mono text-[10px] tabular-nums text-zinc-600">
                    {Math.round((point.total / total) * 100)}%
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
