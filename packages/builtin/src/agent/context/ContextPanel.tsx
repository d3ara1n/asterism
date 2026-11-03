import { useCallback, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useI18n, useRendererObject, useSessionRead } from "@asterism-app/sdk/renderer";
import type { z } from "zod";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Button } from "@asterism-app/ui/ui/button";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { cn } from "@asterism-app/ui/utils";
import { formatCount } from "@asterism-app/ui/format-count";
import { modelReference } from "@asterism-app/sdk/contracts";
import { resolveAgentModel } from "@asterism-app/builtin-api/contracts";
import { useSettingsConfiguration } from "../../configuration/renderer-state";
import { contextMessages as messages } from "../../messages/context";
import { readAgentInsight } from "../renderer-history";
import type { AgentView } from "../data";
import { diagnosticModel } from "../diagnostics/cost";
import { ease, PanelBody, percent, Section, Swatch, SystemComposition } from "../panel-kit";
import { WindowMeter } from "./WindowMeter";
import { allocateTiles, conversationCategories, type ContextInsight, type ConversationCategory } from "./insight";

const COLUMNS = 20, ROWS = 5;
/** Categories take chart colors in a fixed order. */
const fill: Record<ConversationCategory, string> = {
  user: "bg-chart-1", assistant: "bg-chart-2", thinking: "bg-chart-4", toolcall: "bg-chart-6",
  result: "bg-chart-3", context: "bg-chart-7", summary: "bg-chart-8", agentMessage: "bg-chart-5",
  eventMessage: "bg-chart-9",
};
/** Window usage: used capacity comes from reported input, while the window and reserve come from the measured request's model configuration. */
function WindowUsage({ insight, selection }: { insight: ContextInsight; selection: z.infer<typeof AgentView.schema>["selection"] }) {
  const i18n = useI18n();
  const { snapshot: configuration } = useSettingsConfiguration();
  const usage = insight.usage;
  if (!usage) return <Section title={i18n.text(messages.window)}><p className="type-caption">{i18n.text(messages.noUsage)}</p></Section>;
  const measured = diagnosticModel({ model: usage.model, modelScope: usage.scope }, configuration?.models ?? []);
  const current = configuration && selection ? resolveAgentModel(configuration, selection) : null;
  const changed = measured && current && modelReference(measured) !== modelReference(current);
  if (usage.compressedAfter) return <Section title={i18n.text(messages.window)}><p className="type-caption">{i18n.text(messages.compressed)}</p></Section>;
  const window = measured?.contextWindow ?? null;
  return <Section title={i18n.text(messages.window)} aside={window ? percent(i18n, usage.input, window) : undefined}>
    <div className="flex items-baseline gap-1.5">
      <span className="type-page tabular-nums">{formatCount(usage.input)}</span>
      <span className="type-caption tabular-nums">{window ? i18n.formatMessage(messages.windowOf, { window: formatCount(window) }) : i18n.text(messages.tokens)}</span>
    </div>
    <WindowMeter input={usage.input} window={window} />
    {(!window || changed) && <div className="space-y-1">
      {!window && <p className="type-caption">{i18n.text(messages.windowUnknown)}</p>}
      {changed && <p className="type-caption">{i18n.formatMessage(messages.modelChanged, { model: measured.name })}</p>}
    </div>}
  </Section>;
}

/** Conversation composition: a tile chart with the conversation's character count as 100%; hovering or focusing either the legend or tiles highlights both. */
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

/** System section: reconstructs the prompt blocks and tool names sent in the latest request without converting them to tokens. */
function SystemParts({ system }: { system: ContextInsight["system"] }) {
  const i18n = useI18n();
  if (!system) return <Section title={i18n.text(messages.system)}><p className="type-caption">{i18n.text(messages.systemPending)}</p></Section>;
  const total = (system.diagnostics.system ?? []).reduce((sum, block) => sum + block.characters, 0);
  return <Section title={i18n.text(messages.system)} aside={i18n.formatMessage(messages.systemTotal, { count: formatCount(total) })}>
    <SystemComposition diagnostics={system.diagnostics} />
  </Section>;
}

/** Context panel: reads the current path and saved measurements without model requests or history writes. */
export function ContextPanel({ data }: { data: z.infer<typeof AgentView.schema> }) {
  const i18n = useI18n();
  const object = useRendererObject();
  const snapshot = object.session.snapshot();
  const result = useSessionRead(snapshot, useCallback((snapshot, signal) => readAgentInsight(snapshot, object.ref.id, signal), [object.ref.id]), { keepPrevious: true });
  return <PanelBody>
    {result.status === "loading" && !result.data && <p className="type-caption" role="status">{i18n.text(commonMessages.loading)}</p>}
    {result.error && <Alert variant="destructive"><AlertDescription>{i18n.text(messages.unavailable)}
      <Button variant="ghost" size="xs" onClick={result.retry}>{i18n.text(commonMessages.retry)}</Button>
    </AlertDescription></Alert>}
    {result.data && <>
      <WindowUsage insight={result.data} selection={data.selection} />
      <ConversationMix conversation={result.data.conversation} />
      <SystemParts system={result.data.system} />
    </>}
  </PanelBody>;
}
