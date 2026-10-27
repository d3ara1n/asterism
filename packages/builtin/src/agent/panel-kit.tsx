import type { CSSProperties, ReactNode } from "react";
import { motion } from "motion/react";
import { useI18n, type I18n } from "@asterism/sdk/renderer";
import type { AgentRequestContextData } from "@asterism/builtin-api/contracts";
import { Badge } from "@asterism/ui/ui/badge";
import { cn } from "@asterism/ui/utils";
import { formatCount } from "@asterism/ui/format-count";
import { contextMessages as messages } from "../messages/context";

/** Layout and chart components shared by agent auxiliary panels. */
export const ease = [0.2, 0.8, 0.2, 1] as const;
export const stripes: CSSProperties = { backgroundImage: "repeating-linear-gradient(-45deg, var(--border) 0 2px, transparent 2px 5px)" };
export const percent = (i18n: I18n, part: number, total: number, digits?: number) =>
  total > 0 ? i18n.formatNumber(part / total, { style: "percent", maximumFractionDigits: digits ?? (part / total < 0.01 && part > 0 ? 1 : 0) }) : "—";

export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-3">{children}</div>;
}
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return <section className="space-y-3">
    <div className="flex items-baseline justify-between gap-3"><h4 className="type-label">{title}</h4>
      {aside && <span className="type-caption tabular-nums">{aside}</span>}</div>
    {children}
  </section>;
}
export function Swatch({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-[3px]", className)} style={style} />;
}
/** Numeric item: label, tabular value, and optional explanation; multiple items form a grid. */
export function Stat({ label, value, caption }: { label: ReactNode; value: ReactNode; caption?: ReactNode }) {
  return <div className="min-w-0 space-y-0.5">
    <dt className="type-caption">{label}</dt>
    <dd className="type-section truncate tabular-nums">{value}</dd>
    {caption && <dd className="type-caption truncate tabular-nums">{caption}</dd>}
  </div>;
}
export function Stats({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 }) {
  return <dl className={cn("grid gap-x-4 gap-y-3", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>{children}</dl>;
}

function SystemRow({ label, detail, value, total, color, nested = false }: { label: string; detail?: string; value: number; total: number; color: string; nested?: boolean }) {
  const i18n = useI18n();
  return <li className={cn("space-y-1", nested && "pl-4")}>
    <div className="flex items-baseline gap-2">
      <span className={cn("min-w-0 flex-1 truncate", nested ? "type-caption text-foreground" : "type-body")} title={detail ?? label}>{label}</span>
      <span className="type-caption tabular-nums">{i18n.formatMessage(messages.characters, { count: formatCount(value) })}</span>
      <span className="type-label w-10 text-right tabular-nums">{percent(i18n, value, total)}</span>
    </div>
    {!nested && <div className="h-1 overflow-hidden rounded-full bg-muted">
      <motion.div className={cn("h-full rounded-full", color)} initial={{ width: 0 }} animate={{ width: total ? `${value / total * 100}%` : 0 }}
        transition={{ duration: 0.5, ease }} />
    </div>}
  </li>;
}
/** System prompt blocks and tool names actually sent in one request; shows only character counts and proportions, without converting to tokens. */
export function SystemComposition({ diagnostics }: { diagnostics: AgentRequestContextData }) {
  const i18n = useI18n();
  const blocks = diagnostics.system ?? [];
  const total = blocks.reduce((sum, block) => sum + block.characters, 0);
  const sum = (kind: string) => blocks.filter(block => block.kind === kind).reduce((value, block) => value + block.characters, 0);
  const files = blocks.flatMap(block => block.kind === "context" ? [block] : []);
  const roles = blocks.flatMap(block => block.kind === "agent" ? [block.role] : []);
  const tools = diagnostics.tools;
  return <div className="space-y-4">
    {diagnostics.system && <ul className="space-y-3">
      <SystemRow total={total} label={i18n.text(messages.environment)} value={sum("system")} color="bg-chart-1" />
      <SystemRow total={total} label={roles.length ? `${i18n.text(messages.agent)} · ${roles.join(", ")}` : i18n.text(messages.agent)} value={sum("agent")} color="bg-chart-2" />
      <li><ul className="space-y-1.5">
        <SystemRow total={total} label={`${i18n.text(messages.injected)} · ${i18n.formatMessage(messages.injectedCount, { count: files.length })}`} value={sum("context")} color="bg-chart-3" />
        {files.map((file, index) => <SystemRow total={total} key={`${file.file}:${index}`} nested label={file.file.split(/[\\/]/).at(-1) ?? file.file}
          detail={file.file} value={file.characters} color="bg-chart-3" />)}
      </ul></li>
    </ul>}
    {tools && <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2"><span className="type-body">{i18n.text(messages.tools)}</span>
        <span className="type-caption">{i18n.formatMessage(messages.toolCount, { count: tools.length })}</span></div>
      {tools.length > 0 && <div className="flex flex-wrap gap-1.5">{tools.map(name => <Badge key={name} variant="secondary" className="type-code">{name}</Badge>)}</div>}
    </div>}
  </div>;
}
