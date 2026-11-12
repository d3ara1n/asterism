import { useState, type ReactNode } from "react";
import type { z } from "zod";
import { motion } from "motion/react";
import { Brain, Check, Minus, Wrench } from "lucide-react";
import { useI18n, type ToolRenderProps, type ToolRendererDefinition } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { Badge } from "@asterism-app/ui/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { formatCount } from "@asterism-app/ui/format-count";
import { cn } from "@asterism-app/ui/utils";
import { modelMessages as messages } from "../messages/models";
import { configurationMessages } from "../messages/configuration";
import { diagnosticMessages } from "../messages/diagnostics";
import { resourceMessages } from "../messages/resources";
import { inputText } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { ease } from "../agent/panel-kit";
import { formatPrice } from "../agent/diagnostics/format";
import { useModelNames } from "./names";
import { ThinkingLevelChips } from "./thinking-levels";
import { groupByProvider, priceSections, priceTables, type PriceItem, type PriceModality } from "./view-model";
import type { GetModelResult, ListModelsResult } from "./contract";

/* ---------- list_models ---------- */

type ListProps = ToolRenderProps<z.infer<typeof ListModelsResult.schema>>;

function ListHeader({ result }: ListProps) {
  const i18n = useI18n();
  const data = result?.data;
  return <ToolHeader label={i18n.text(messages.list)} meta={data && [
    i18n.formatMessage(configurationMessages.modelCount, { count: data.length }),
    i18n.formatMessage(messages.providerCount, { count: groupByProvider(data).length }),
  ].join(" · ")} />;
}

function ListBody({ result }: ListProps) {
  const i18n = useI18n();
  const names = useModelNames();
  const data = result?.data;
  if (!data) return null;
  if (!data.length) return <p className="type-caption">{i18n.text(messages.empty)}</p>;
  const groups = groupByProvider(data.slice(0, TOOL_BODY_LINE_LIMIT));
  return <div className="@container/models space-y-2">
    <div className="grid grid-cols-1 items-start gap-2 @min-[36rem]/models:grid-cols-2">
      {groups.map(group => <section key={group.provider} className="min-w-0 rounded-md border">
        <header className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
          <h4 className="min-w-0 truncate type-label text-foreground" title={group.provider}>{names.provider(group.provider)}</h4>
          <Badge variant="secondary" className="py-0 font-normal tabular-nums">{group.models.length}</Badge>
        </header>
        <ul className="divide-y">{group.models.map(entry => {
          const name = names.model(entry.expression);
          return <li key={entry.expression} className="min-w-0 px-3 py-1.5" title={entry.expression}>
            <p className="truncate text-sm">{name ?? entry.model}</p>
            {name && <p className="truncate type-caption type-code">{entry.model}</p>}
          </li>;
        })}</ul>
      </section>)}
    </div>
    {data.length > TOOL_BODY_LINE_LIMIT && <p className="type-caption">
      {i18n.formatMessage(resourceMessages.omitted, { count: data.length - TOOL_BODY_LINE_LIMIT })}
    </p>}
  </div>;
}

export const listModelsView: ToolRendererDefinition<z.infer<typeof ListModelsResult.schema>> = {
  input: { headerRenderer: ListHeader },
  execution: { headerRenderer: ListHeader },
  result: { headerRenderer: ListHeader, bodyRenderer: ListBody },
};

/* ---------- get_model ---------- */

type ModelInfo = z.infer<typeof GetModelResult.schema>;
type GetProps = ToolRenderProps<ModelInfo>;

function GetHeader({ args, result }: GetProps) {
  const i18n = useI18n();
  const names = useModelNames();
  const data = result?.data;
  const expression = data?.model ?? inputText(args, "model");
  const slash = expression?.indexOf("/") ?? -1;
  const provider = data?.provider ?? (slash > 0 ? expression!.slice(0, slash) : undefined);
  return <ToolHeader label={i18n.text(messages.get)} subject={provider && names.provider(provider)}
    summary={data?.name ?? (expression && (names.model(expression) ?? (slash > 0 ? expression.slice(slash + 1) : expression)))}
    meta={data?.contextWindow != null && i18n.formatMessage(configurationMessages.tokens, { count: formatCount(data.contextWindow) })} />;
}

function Capability({ icon, label, supported }: { icon: ReactNode; label: string; supported: boolean }) {
  const i18n = useI18n();
  const state = i18n.text(supported ? configurationMessages.supported : configurationMessages.unsupported);
  return <span title={state} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 type-caption [&_svg]:size-3.5 [&_svg]:shrink-0",
    supported ? "text-foreground" : "border-dashed text-muted-foreground/70")}>
    {icon}<span>{label}</span>
    {supported ? <Check aria-hidden="true" className="text-success" /> : <Minus aria-hidden="true" />}
    <span className="sr-only">{state}</span>
  </span>;
}

function Bar({ share, className }: { share: number | null; className: string }) {
  return <div className={cn("h-2 min-w-0 flex-1 overflow-hidden rounded-full", share === null ? "border border-dashed" : "bg-muted")}>
    {share !== null && <motion.div className={cn("h-full rounded-full", className)} initial={{ width: 0 }}
      animate={{ width: `${Math.max(share, 0) * 100}%` }} transition={{ duration: 0.6, ease }} />}
  </div>;
}

function Row({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return <li className="grid grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)_auto] items-center gap-3 type-caption">
    <span className="truncate" title={label}>{label}</span>{children}
    <span className="text-right tabular-nums text-foreground">{value}</span>
  </li>;
}

const modalityLabels = { text: messages.text, image: messages.image, audio: messages.audio, video: messages.video } satisfies Record<PriceModality, unknown>;
const itemLabels = {
  input: diagnosticMessages.input, cacheRead: diagnosticMessages.cacheRead, cacheWrite: diagnosticMessages.cacheWrite,
  output: diagnosticMessages.output, reasoning: diagnosticMessages.reasoning,
} satisfies Record<PriceItem, unknown>;
const itemColors: Record<PriceItem, string> = {
  input: "bg-chart-1", cacheRead: "bg-chart-2", cacheWrite: "bg-chart-7", output: "bg-chart-4", reasoning: "bg-chart-8",
};

function Prices({ cost }: { cost: ModelInfo["cost"] }) {
  const i18n = useI18n();
  const tables = priceTables(cost);
  const [selected, setSelected] = useState(0);
  const table = tables[Math.min(selected, tables.length - 1)];
  const sections = table ? priceSections(table.rates) : [];
  return <section className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="type-label">{i18n.text(messages.prices)}</h4>
      {tables.length > 1 && <ToggleGroup type="single" variant="outline" size="sm" value={String(selected)}
        onValueChange={value => value && setSelected(Number(value))} aria-label={i18n.text(messages.priceTier)}>
        {tables.map((entry, index) => <ToggleGroupItem key={index} value={String(index)} className="h-6 px-2 type-caption">
          {entry.fromInputTokens === null ? i18n.text(diagnosticMessages.basePrice)
            : i18n.formatMessage(messages.tierFrom, { count: formatCount(entry.fromInputTokens) })}
        </ToggleGroupItem>)}
      </ToggleGroup>}
    </div>
    {sections.length ? sections.map(section => <div key={section.modality} className="space-y-1.5">
      {(sections.length > 1 || section.modality !== "text") && <p className="type-caption">{i18n.text(modalityLabels[section.modality])}</p>}
      <ul className="space-y-1.5">{section.rows.map(row => <Row key={row.item} label={i18n.text(itemLabels[row.item])} value={formatPrice(i18n, row.price)}>
        <Bar share={row.share} className={itemColors[row.item]} />
      </Row>)}</ul>
    </div>) : <p className="type-caption">{i18n.text(messages.noPrices)}</p>}
  </section>;
}

function GetBody({ result }: GetProps) {
  const i18n = useI18n();
  const model = result?.data;
  if (!model) return null;
  const unknown = i18n.text(diagnosticMessages.unknown);
  const tokens = (value: number | null) => value === null ? unknown : i18n.formatMessage(configurationMessages.tokens, { count: formatCount(value) });
  const window = model.contextWindow, output = model.generation.maxOutputTokens;
  const scale = Math.max(window ?? 0, output ?? 0);
  const share = (value: number | null) => value === null || !scale ? null : value / scale;
  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h3 className="type-section wrap-anywhere">{model.name}</h3>
        <p className="type-caption type-code wrap-anywhere">{model.model}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Capability icon={<Brain aria-hidden="true" />} label={i18n.text(configurationMessages.thinkingCapability)} supported={model.capabilities.reasoning} />
        <Capability icon={<Wrench aria-hidden="true" />} label={i18n.text(configurationMessages.toolCapability)} supported={model.capabilities.tools} />
      </div>
    </header>
    {model.capabilities.reasoning && <section className="space-y-2">
      <h4 className="type-label">{i18n.text(messages.thinkingLevels)}</h4>
      <ThinkingLevelChips supported={model.capabilities.thinkingLevels} />
    </section>}
    <section className="space-y-2">
      <h4 className="type-label">{i18n.text(messages.capacity)}</h4>
      <ul className="space-y-1.5">
        <Row label={i18n.text(configurationMessages.contextWindow)} value={tokens(window)}><Bar share={share(window)} className="bg-primary" /></Row>
        <Row label={i18n.text(messages.outputLimit)} value={tokens(output)}><Bar share={share(output)} className="bg-chart-4" /></Row>
      </ul>
    </section>
    <Prices cost={model.cost} />
  </div>;
}

const getHeader = { headerRenderer: GetHeader };
export const getModelView: ToolRendererDefinition<ModelInfo> = {
  input: getHeader, execution: getHeader,
  result: { headerRenderer: GetHeader, bodyRenderer: GetBody },
};
