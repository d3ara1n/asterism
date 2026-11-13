import type { ReactNode } from "react";
import type { CatalogModel, ModelRates, UnitPrice } from "@asterism-app/sdk/contracts";
import { useI18n, type I18n } from "@asterism-app/sdk/renderer";
import { Brain, Check, Minus, Wrench } from "lucide-react";
import { formatCount } from "./format-count";
import { referenceModelMessages as messages } from "./messages/reference-model";
import { thinkingLabels } from "./messages/model-selection";
import { Badge } from "./ui/badge";

function Capability({ icon, label, supported }: { icon: ReactNode; label: string; supported: boolean }) {
  const i18n = useI18n();
  const state = i18n.text(supported ? messages.supported : messages.unsupported);
  return <Badge variant="outline" className="font-normal" title={state}>
    {icon}{label}{supported ? <Check className="text-success" aria-hidden /> : <Minus aria-hidden />}
    <span className="sr-only"> · {state}</span>
  </Badge>;
}

function formatPrice(i18n: I18n, price: UnitPrice): string {
  return i18n.formatMessage(messages.rate, {
    amount: i18n.formatNumber(price.amount, { style: "currency", currency: "USD", maximumSignificantDigits: 8 }),
    count: price.unit === "token" ? formatCount(price.per) : i18n.formatNumber(price.per),
    unit: price.unit === "token" ? "toks" : i18n.text(messages[price.unit]),
  });
}

function Rates({ rates }: { rates: ModelRates }) {
  const i18n = useI18n();
  const sections = (["text", "image", "audio", "video"] as const).flatMap(modality => {
    const rows = (["input", "cacheRead", "cacheWrite", "output", "reasoning"] as const).flatMap(item => {
      const price = rates[modality][item];
      return price === null ? [] : [{ item, price }];
    });
    if (!rows.length) return [];
    return [<section key={modality} className="flex flex-col gap-1">
      <h5 className="type-caption text-muted-foreground">{i18n.text(messages[modality])}</h5>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 type-caption">
        {rows.map(({ item, price }) => <div key={item} className="contents">
          <dt className="text-muted-foreground">{i18n.text(messages[item])}</dt>
          <dd className="text-right tabular-nums">{formatPrice(i18n, price)}</dd>
        </div>)}
      </dl>
    </section>];
  });
  return sections.length ? sections : <p className="type-caption text-muted-foreground">{i18n.text(messages.noPrices)}</p>;
}

/** Compact, read-only projection of the configured model metadata used by selectors and model tools. */
export function ModelReferenceDetails({ model, enabled }: { model: CatalogModel; enabled: boolean }) {
  const i18n = useI18n();
  const tokens = (value: number | null) => value === null ? "—" : `${formatCount(value)} toks`;
  const cost = model.cost;
  return <div className="mt-2 flex flex-col gap-3 border-t pt-3">
    <div className="flex flex-wrap gap-1">
      {!enabled && <Badge variant="outline">{i18n.text(messages.disabled)}</Badge>}
      <Capability icon={<Brain aria-hidden />} label={i18n.text(messages.reasoning)} supported={model.capabilities.reasoning} />
      <Capability icon={<Wrench aria-hidden />} label={i18n.text(messages.tools)} supported={model.capabilities.tools} />
    </div>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 type-caption">
      <dt className="text-muted-foreground">{i18n.text(messages.context)}</dt><dd className="text-right tabular-nums">{tokens(model.contextWindow)}</dd>
      <dt className="text-muted-foreground">{i18n.text(messages.outputLimit)}</dt><dd className="text-right tabular-nums">{tokens(model.generation.maxOutputTokens)}</dd>
    </dl>
    {model.capabilities.reasoning && <section className="flex flex-col gap-1.5">
      <h4 className="type-caption text-muted-foreground">{i18n.text(messages.thinkingLevels)}</h4>
      <div className="flex flex-wrap gap-1">{model.capabilities.thinkingLevels.map(level =>
        <Badge key={level} variant="secondary" className="font-normal">{i18n.text(thinkingLabels[level])}</Badge>)}{!model.capabilities.thinkingLevels.length && "—"}</div>
    </section>}
    <section className="flex flex-col gap-2">
      <h4 className="type-caption font-medium">{i18n.text(messages.prices)}</h4>
      {cost ? <>
        {cost.tiers.length > 0 && <h5 className="type-caption text-muted-foreground">{i18n.text(messages.basePrice)}</h5>}
        <Rates rates={cost.rates} />
        {cost.tiers.map(tier => <section key={tier.fromInputTokens} className="flex flex-col gap-2 border-t pt-2">
          <h5 className="type-caption text-muted-foreground">≥ {tokens(tier.fromInputTokens)}</h5>
          <Rates rates={tier.rates} />
        </section>)}
      </> : <p className="type-caption text-muted-foreground">{i18n.text(messages.noPrices)}</p>}
    </section>
  </div>;
}
