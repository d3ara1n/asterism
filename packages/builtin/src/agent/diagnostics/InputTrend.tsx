import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "@asterism/sdk/renderer";
import { formatCount } from "@asterism/ui/format-count";
import { diagnosticMessages as messages } from "../../messages/diagnostics";
import { ease, percent, Swatch } from "../panel-kit";
import type { CompressionEntry, TrendPoint } from "./overview";

/** Reported input and cache reads per request on the current path; dashed lines mark compression, and the horizontal dashed line marks the automatic compression threshold. Plots only saved actual measurements. */
export function InputTrend({ points, compressions, threshold }: { points: readonly TrendPoint[]; compressions: readonly CompressionEntry[]; threshold: number | null }) {
  const i18n = useI18n();
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const current = Math.min(active ?? points.length - 1, points.length - 1);
  const peak = Math.max(...points.map(point => point.input), 1);
  // Exclude the threshold from the vertical axis when it is far above the curve, so growth is not flattened into a line.
  const showThreshold = threshold !== null && threshold > 0 && threshold <= peak * 1.4;
  const top = Math.max(peak, showThreshold ? threshold : 0) * 1.08;
  const x = (index: number) => points.length === 1 ? 50 : index / (points.length - 1) * 100;
  const y = (value: number) => 100 - value / top * 100;
  const line = (value: (point: TrendPoint) => number) => points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(value(point))}`).join(" ");
  const area = (value: (point: TrendPoint) => number) => `${line(value)} L${x(points.length - 1)},100 L${x(0)},100 Z`;
  const markers = compressions.flatMap(entry => {
    const next = points.findIndex(point => point.sequence > entry.sequence);
    if (next === 0) return [];
    return [{ id: entry.id, x: next === -1 ? 100 : (x(next - 1) + x(next)) / 2 }];
  });
  const point = points[current]!;
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setActive(Math.round(Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) * (points.length - 1)));
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: points.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(Math.min(Math.max(next, 0), points.length - 1));
  };
  return <div className="space-y-2">
    <p className="type-caption tabular-nums" aria-live="polite">
      <span className="text-foreground">{i18n.formatMessage(messages.trendPoint, { index: current + 1, input: formatCount(point.input) })}</span>
      {point.cacheRead !== null && <> · {i18n.formatMessage(messages.trendCache, { cache: formatCount(point.cacheRead), rate: percent(i18n, point.cacheRead, point.input) })}</>}
      {" · "}{point.delta === null ? i18n.text(messages.trendIncomparable)
        : i18n.formatMessage(messages.trendDelta, { delta: formatCount(point.delta, "exceptZero") })}
    </p>
    <div tabIndex={0} role="group" aria-label={i18n.text(messages.trend)} onPointerMove={move} onPointerLeave={() => setActive(null)} onKeyDown={key}
      className="relative h-20 cursor-crosshair rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <motion.div className="absolute inset-0" initial={reduced ? false : { clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }} transition={{ duration: 0.7, ease }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full overflow-visible" aria-hidden="true">
          <line x1="0" x2="100" y1="100" y2="100" className="stroke-border" vectorEffect="non-scaling-stroke" />
          {showThreshold && <line x1="0" x2="100" y1={y(threshold)} y2={y(threshold)} className="stroke-muted-foreground"
            strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          {markers.map(marker => <line key={marker.id} x1={marker.x} x2={marker.x} y1="0" y2="100" className="stroke-muted-foreground/60"
            strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />)}
          <path d={area(item => item.input)} className="fill-chart-1/15" />
          <path d={area(item => item.cacheRead ?? 0)} className="fill-chart-2/35" />
          <path d={line(item => item.input)} fill="none" className="stroke-chart-1" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <line x1={x(current)} x2={x(current)} y1="0" y2="100" className="stroke-foreground/20" vectorEffect="non-scaling-stroke" />
        </svg>
      </motion.div>
      <span aria-hidden="true" className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1 ring-2 ring-card"
        style={{ left: `${x(current)}%`, top: `${y(point.input)}%` }} />
    </div>
    <ul className="flex flex-wrap gap-x-3 gap-y-1 type-caption">
      <li className="flex items-center gap-1.5"><Swatch className="bg-chart-1" />{i18n.text(messages.input)}</li>
      <li className="flex items-center gap-1.5"><Swatch className="bg-chart-2" />{i18n.text(messages.cacheRead)}</li>
      {markers.length > 0 && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 border-l border-dashed border-muted-foreground" />{i18n.text(messages.compression)}</li>}
      {showThreshold && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-2.5 border-t border-dashed border-muted-foreground" />{i18n.text(messages.threshold)}</li>}
    </ul>
  </div>;
}
