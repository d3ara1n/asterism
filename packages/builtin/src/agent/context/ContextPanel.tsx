import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useI18n, useRendererCatalogs, useRendererObject } from "@asterism/sdk/renderer";
import type { z } from "zod";
import { Alert, AlertDescription } from "@asterism/ui/ui/alert";
import { cn } from "@asterism/ui/utils";
import { formatCount } from "@asterism/ui/format-count";
import { modelReference } from "@asterism/sdk/contracts";
import { resolveAgentModel, ModelConfiguration } from "@asterism/builtin-api/contracts";
import { contextMessages as messages } from "../../messages/context";
import { COMPRESSION_RESERVE } from "../context-budget";
import { ContextProjectionError } from "../context-projection";
import type { AgentView } from "../data";
import { diagnosticModel } from "../diagnostics/cost";
import { ease, PanelBody, percent, Section, stripes, Swatch, SystemComposition } from "../panel-kit";
import { allocateTiles, contextInsight, conversationCategories, type ContextInsight, type ConversationCategory } from "./insight";

const COLUMNS = 20, ROWS = 5;
/** 类别按固定顺序取图表色。 */
const fill: Record<ConversationCategory, string> = {
  user: "bg-chart-1", assistant: "bg-chart-2", thinking: "bg-chart-4", toolcall: "bg-chart-6",
  result: "bg-chart-3", context: "bg-chart-7", summary: "bg-chart-8", agentMessage: "bg-chart-5",
};
/** 窗口占用：已用取实报 input，窗口与预留来自所测请求的模型配置；不画未计量内容。 */
function WindowUsage({ insight, selection }: { insight: ContextInsight; selection: z.infer<typeof AgentView.schema>["selection"] }) {
  const i18n = useI18n();
  const configuration = useRendererCatalogs().get(ModelConfiguration);
  const usage = insight.usage;
  if (!usage) return <Section title={i18n.text(messages.window)}><p className="type-caption">{i18n.text(messages.noUsage)}</p></Section>;
  const measured = diagnosticModel({ model: usage.model, modelScope: usage.scope }, configuration?.models ?? []);
  const current = configuration && selection ? resolveAgentModel(configuration, selection) : null;
  const changed = measured && current && modelReference(measured) !== modelReference(current);
  if (usage.compressedAfter) return <Section title={i18n.text(messages.window)}><p className="type-caption">{i18n.text(messages.compressed)}</p></Section>;
  const window = measured?.contextWindow ?? null;
  const reserve = window ? Math.min(COMPRESSION_RESERVE, window) : 0;
  const used = window ? Math.min(usage.input, window) : usage.input;
  const free = window ? Math.max(window - reserve - used, 0) : 0;
  const share = (value: number) => window ? `${value / window * 100}%` : "0%";
  const legend = [
    { key: "used", label: messages.used, value: usage.input, swatch: <Swatch className="bg-chart-1" /> },
    ...window ? [
      { key: "free", label: messages.free, value: free, swatch: <Swatch className="bg-muted ring-1 ring-border ring-inset" /> },
      { key: "reserve", label: messages.reserve, value: reserve, swatch: <Swatch className="ring-1 ring-border ring-inset" style={stripes} /> },
    ] : [],
  ];
  return <Section title={i18n.text(messages.window)} aside={window ? percent(i18n, usage.input, window) : undefined}>
    <div className="flex items-baseline gap-1.5">
      <span className="type-page tabular-nums">{formatCount(usage.input)}</span>
      <span className="type-caption tabular-nums">{window ? i18n.formatMessage(messages.windowOf, { window: formatCount(window) }) : i18n.text(messages.tokens)}</span>
    </div>
    {window && <div role="img" aria-label={`${i18n.text(messages.used)} ${percent(i18n, usage.input, window)}`}
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted ring-1 ring-border ring-inset">
      <motion.div className="h-full bg-chart-1" initial={{ width: 0 }} animate={{ width: share(used) }}
        transition={{ duration: 0.6, ease }} />
      <div className="h-full flex-1" />
      <div className="h-full border-l border-border" style={{ ...stripes, width: share(reserve) }} />
    </div>}
    <ul className="space-y-1">{legend.map(item => <li key={item.key} className="flex items-center gap-2 type-caption">
      {item.swatch}<span className="flex-1">{i18n.text(item.label)}</span>
      <span className="tabular-nums">{formatCount(item.value)}</span>
    </li>)}</ul>
    <div className="space-y-1">
      {!window && <p className="type-caption">{i18n.text(messages.windowUnknown)}</p>}
      {changed && <p className="type-caption">{i18n.formatMessage(messages.modelChanged, { model: measured.name })}</p>}
      <p className="type-caption">{i18n.text(messages.reported)} {i18n.text(messages.pending)}</p>
    </div>
  </Section>;
}

/** 对话构成：以对话字数为 100% 的瓷砖图，图例与格子悬停或聚焦双向高亮。 */
function ConversationMix({ conversation }: { conversation: ContextInsight["conversation"] }) {
  const i18n = useI18n();
  const [active, setActive] = useState<ConversationCategory | null>(null);
  const present = conversationCategories.filter(category => conversation.characters[category] > 0);
  const tiles = useMemo(() => {
    const counts = allocateTiles(present.map(category => conversation.characters[category]), COLUMNS * ROWS);
    return present.flatMap((category, index) => Array.from({ length: counts[index]! }, () => category));
  }, [conversation, present.join()]);
  const total = conversation.total;
  return <Section title={i18n.text(messages.conversation)} aside={total > 0 ? i18n.formatMessage(messages.conversationTotal, { count: formatCount(total) }) : undefined}>
    {total === 0 ? <p className="type-caption">{i18n.text(messages.conversationEmpty)}</p> : <>
      <div aria-hidden="true" className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
        onMouseLeave={() => setActive(null)}>
        {tiles.map((category, index) => <motion.span key={index} onMouseEnter={() => setActive(category)}
          className={cn("aspect-square rounded-[3px] transition-opacity duration-200 motion-reduce:transition-none", fill[category],
            active && active !== category && "opacity-20")}
          initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.004, duration: 0.25, ease }} />)}
      </div>
      <ul className="space-y-0.5" onMouseLeave={() => setActive(null)}>
        {present.map(category => {
          const value = conversation.characters[category];
          return <li key={category} tabIndex={0} onMouseEnter={() => setActive(category)} onFocus={() => setActive(category)} onBlur={() => setActive(null)}
            className={cn("-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active === category && "bg-accent")}>
            <Swatch className={fill[category]} />
            <span className="type-body min-w-0 flex-1 truncate">{i18n.text(messages[category])}</span>
            <span className="type-caption tabular-nums">{i18n.formatMessage(messages.characters, { count: formatCount(value) })}</span>
            <span className="type-label w-10 text-right tabular-nums">{percent(i18n, value, total)}</span>
          </li>;
        })}
      </ul>
      {conversation.files > 0 && <p className="type-caption">{i18n.formatMessage(messages.files, { count: conversation.files })}</p>}
    </>}
  </Section>;
}

/** 系统部分：还原最近一次请求发出的提示块与工具名称，不换算 token。 */
function SystemParts({ system }: { system: ContextInsight["system"] }) {
  const i18n = useI18n();
  if (!system) return <Section title={i18n.text(messages.system)}><p className="type-caption">{i18n.text(messages.systemPending)}</p></Section>;
  const total = (system.diagnostics.system ?? []).reduce((sum, block) => sum + block.characters, 0);
  return <Section title={i18n.text(messages.system)} aside={i18n.formatMessage(messages.systemTotal, { count: formatCount(total) })}>
    <SystemComposition diagnostics={system.diagnostics} />
  </Section>;
}

/** 上下文面板：只读当前路径与已保存计量，打开或浏览不发起请求、不写入历史。 */
export function ContextPanel({ data }: { data: z.infer<typeof AgentView.schema> }) {
  const i18n = useI18n();
  const object = useRendererObject();
  const snapshot = object.session.snapshot();
  const result = useMemo((): { ok: true; insight: ContextInsight } | { ok: false } | null => {
    if (!snapshot) return null;
    try { return { ok: true, insight: contextInsight(snapshot, object.ref.id) }; }
    catch (error) { if (error instanceof ContextProjectionError) return { ok: false }; throw error; }
  }, [snapshot, object.ref.id]);
  return <PanelBody>
    {result && !result.ok && <Alert variant="destructive"><AlertDescription>{i18n.text(messages.unavailable)}</AlertDescription></Alert>}
    {result?.ok && <>
      <WindowUsage insight={result.insight} selection={data.selection} />
      <ConversationMix conversation={result.insight.conversation} />
      <SystemParts system={result.insight.system} />
    </>}
  </PanelBody>;
}
