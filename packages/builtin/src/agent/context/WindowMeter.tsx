import { motion } from "motion/react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { formatCount } from "@asterism-app/ui/format-count";
import { cn } from "@asterism-app/ui/utils";
import { contextMessages as messages } from "../../messages/context";
import { COMPRESSION_RESERVE } from "../context-budget";
import { ease, percent, stripes, Swatch } from "../panel-kit";

/** Window occupancy: used capacity comes from reported input; free space and the compression reserve require a known window. `fill` colors the used segment and its swatch. */
export function WindowMeter({ input, window, fill = "bg-chart-1" }: { input: number; window: number | null; fill?: string }) {
  const i18n = useI18n();
  const reserve = window ? Math.min(COMPRESSION_RESERVE, window) : 0;
  const used = window ? Math.min(input, window) : input;
  const free = window ? Math.max(window - reserve - used, 0) : 0;
  const share = (value: number) => window ? `${value / window * 100}%` : "0%";
  const legend = [
    { key: "used", label: messages.used, value: input, swatch: <Swatch className={fill} /> },
    ...window ? [
      { key: "free", label: messages.free, value: free, swatch: <Swatch className="bg-muted ring-1 ring-border ring-inset" /> },
      { key: "reserve", label: messages.reserve, value: reserve, swatch: <Swatch className="ring-1 ring-border ring-inset" style={stripes} /> },
    ] : [],
  ];
  return <div className="space-y-2">
    {window && <div role="img" aria-label={`${i18n.text(messages.used)} ${percent(i18n, input, window)}`}
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted ring-1 ring-border ring-inset">
      <motion.div className={cn("h-full", fill)} initial={{ width: 0 }} animate={{ width: share(used) }}
        transition={{ duration: 0.6, ease }} />
      <div className="h-full flex-1" />
      <div className="h-full border-l border-border" style={{ ...stripes, width: share(reserve) }} />
    </div>}
    <ul className="space-y-1">{legend.map(item => <li key={item.key} className="flex items-center gap-2 type-caption">
      {item.swatch}<span className="flex-1">{i18n.text(item.label)}</span>
      <span className="tabular-nums">{formatCount(item.value)}</span>
    </li>)}</ul>
  </div>;
}
