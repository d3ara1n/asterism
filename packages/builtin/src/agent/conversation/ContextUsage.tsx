import { useCallback } from "react";
import { modelReference } from "@asterism-app/sdk/contracts";
import { useI18n, useRendererCatalogs, useRendererObject, useSessionRead } from "@asterism-app/sdk/renderer";
import { ModelCatalog } from "@asterism-app/sdk/contracts";
import { useAgentModelSelection } from "@asterism-app/builtin-api/renderer";
import { formatCount } from "@asterism-app/ui/format-count";
import { ProgressRing } from "@asterism-app/ui/ui/progress-ring";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { contextMessages as messages } from "../../messages/context";
import { readAgentMeasurements } from "../renderer-history";
import { diagnosticModel } from "../diagnostics/cost";
import { percent } from "../panel-kit";
import { WindowMeter } from "../context/WindowMeter";
import { MetricCard } from "./MetricCard";

/** Conversation measurements share their source with the context panel; the ring stays unmeasured until a saved request reports input. */
export function ContextUsage() {
  const i18n = useI18n();
  const object = useRendererObject();
  const snapshot = object.session.snapshot();
  const configuration = useRendererCatalogs().get(ModelCatalog);
  const { model: current } = useAgentModelSelection();
  const read = useSessionRead(snapshot, useCallback((snapshot, signal) => readAgentMeasurements(snapshot, object.ref.id, signal), [object.ref.id]), { keepPrevious: true });
  const result = read.data;
  const usage = result?.usage;
  const measured = usage ? diagnosticModel({ model: usage.model, modelScope: usage.scope }, configuration?.models ?? []) : null;
  const changed = measured && current && modelReference(measured) !== modelReference(current);
  const window = measured?.contextWindow ?? null;
  const input = usage && !usage.compressedAfter ? usage.input : null;
  const ratio = input !== null && window ? input / window : null;
  const status = !result ? read.status === "loading" ? commonMessages.loading : messages.unavailable
    : !usage ? messages.noUsage : usage.compressedAfter ? messages.compressed : null;
  const value = ratio !== null ? percent(i18n, input!, window!, 1) : input !== null ? formatCount(input) : "—";

  return <MetricCard label={i18n.text(messages.window)} value={value}
    icon={<ProgressRing value={ratio} />}>
    <div className="flex items-baseline justify-between gap-3">
      <h4 className="type-label">{i18n.text(messages.window)}</h4>
      {ratio !== null && <span className="type-section tabular-nums">{value}</span>}
    </div>
    {input !== null ? <>
      <div className="flex items-baseline gap-1.5">
        <span className="type-page tabular-nums">{formatCount(input)}</span>
        <span className="type-caption tabular-nums">{window
          ? i18n.formatMessage(messages.windowOf, { window: formatCount(window) }) : i18n.text(messages.tokens)}</span>
      </div>
      <WindowMeter input={input} window={window} fill="bg-primary" />
      {!window && <p className="type-caption">{i18n.text(messages.windowUnknown)}</p>}
      {changed && <p className="type-caption">{i18n.formatMessage(messages.modelChanged, { model: measured.name })}</p>}
    </> : status && <p className="type-caption">{i18n.text(status)}</p>}
  </MetricCard>;
}
