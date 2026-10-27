import type { ReactNode } from "react";
import type { UnitPrice } from "@asterism-app/sdk/contracts";
import type { CatalogModel } from "@asterism-app/builtin-api/contracts";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Separator } from "@asterism-app/ui/ui/separator";
import { formatCount } from "@asterism-app/ui/format-count";
import { configurationMessages as messages } from "../../messages/configuration";
import { diagnosticMessages } from "../../messages/diagnostics";
import { formatPrice } from "../diagnostics/format";

/** Reads only current catalog data; the output limit is configured, and reference prices do not represent actual account charges. */
export function ModelPreview({ model, providerName }: { model: CatalogModel; providerName: string }) {
  const i18n = useI18n();
  const unknown = i18n.text(diagnosticMessages.unknown);
  const tokens = (value: number | null) => value === null ? unknown : i18n.formatMessage(messages.tokens, { count: formatCount(value) });
  const support = (value: boolean) => i18n.text(value ? messages.supported : messages.unsupported);
  const price = (value: UnitPrice | null | undefined) => value == null ? unknown : formatPrice(i18n, value);
  const rates = model.cost?.rates.text;
  return <div className="flex flex-col gap-3">
    <header className="flex flex-col gap-1">
      <h3 className="type-label wrap-anywhere">{model.name}</h3>
      <p className="type-caption text-muted-foreground">{providerName}</p>
      <p className="type-caption wrap-anywhere text-muted-foreground">{model.modelId}</p>
    </header>
    <dl className="flex flex-col gap-2">
      <Detail label={i18n.text(messages.contextWindow)}>{tokens(model.contextWindow)}</Detail>
      <Detail label={i18n.text(messages.outputLimit)}>{tokens(model.generation.maxOutputTokens)}</Detail>
      <Detail label={i18n.text(messages.thinkingCapability)}>{support(model.capabilities.reasoning)}</Detail>
      <Detail label={i18n.text(messages.toolCapability)}>{support(model.capabilities.tools)}</Detail>
    </dl>
    <Separator />
    <h4 className="type-label">{i18n.text(messages.baseTextPrices)}</h4>
    <dl className="flex flex-col gap-2">
      <Detail label={i18n.text(diagnosticMessages.input)}>{price(rates?.input)}</Detail>
      <Detail label={i18n.text(diagnosticMessages.cacheRead)}>{price(rates?.cacheRead)}</Detail>
      <Detail label={i18n.text(diagnosticMessages.output)}>{price(rates?.output)}</Detail>
      {rates?.cacheWrite && <Detail label={i18n.text(diagnosticMessages.cacheWrite)}>{price(rates.cacheWrite)}</Detail>}
      {rates?.reasoning && <Detail label={i18n.text(diagnosticMessages.reasoning)}>{price(rates.reasoning)}</Detail>}
    </dl>
    <p className="type-caption text-muted-foreground">{i18n.text(messages.referencePricesHint)}</p>
    {!!model.cost?.tiers.length && <p className="type-caption text-muted-foreground">
      {i18n.formatMessage(messages.priceTiersHint, { count: model.cost.tiers.length })}
    </p>}
  </div>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="type-caption flex items-baseline justify-between gap-3">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 text-right tabular-nums">{children}</dd>
  </div>;
}
