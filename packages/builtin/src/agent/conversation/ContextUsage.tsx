import { useMemo } from "react";
import { modelReference } from "@atelier/sdk/contracts";
import { useI18n, useRendererCatalogs, useRendererObject } from "@atelier/sdk/renderer";
import { ModelConfiguration, resolveAgentModel, type AgentSelection } from "@atelier/builtin-api/contracts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@atelier/ui/ui/tooltip";
import { formatCount } from "@atelier/ui/format-count";
import { contextMessages as messages } from "../../messages/context";
import { contextInsight } from "../context/insight";
import { ContextProjectionError } from "../context-projection";
import { diagnosticModel } from "../diagnostics/cost";
import { percent } from "../panel-kit";

/** 对话计量与上下文面板同源；仅显示已保存请求的实报占用。 */
export function ContextUsage({ selection }: { selection: AgentSelection }) {
  const i18n = useI18n();
  const object = useRendererObject();
  const snapshot = object.session.snapshot();
  const configuration = useRendererCatalogs().get(ModelConfiguration);
  const result = useMemo(() => {
    if (!snapshot) return null;
    try { return { usage: contextInsight(snapshot, object.ref.id).usage }; }
    catch (error) { if (error instanceof ContextProjectionError) return null; throw error; }
  }, [snapshot, object.ref.id]);
  const usage = result?.usage;
  const measured = usage ? diagnosticModel({ model: usage.model, modelScope: usage.scope }, configuration?.models ?? []) : null;
  const current = configuration ? resolveAgentModel(configuration, selection) : null;
  const changed = measured && current && modelReference(measured) !== modelReference(current);
  const window = measured?.contextWindow ?? null;
  const input = usage && !usage.compressedAfter ? usage.input : null;
  const ratio = input !== null && window ? input / window : null;
  const status = !result ? messages.unavailable : !usage ? messages.noUsage
    : usage.compressedAfter ? messages.compressed : !window ? messages.windowUnknown : null;
  const title = `${i18n.text(messages.window)}${ratio !== null ? ` · ${percent(i18n, input!, window!)}` : ""}`;
  const description = status ? i18n.text(status) : i18n.text(messages.reported);

  return <Tooltip delayDuration={300}>
    <TooltipTrigger asChild>
      <span tabIndex={0} role="img" aria-label={`${title}. ${description}`}
        className="flex size-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 -rotate-90" fill="none" strokeWidth="2.5">
          <circle cx="10" cy="10" r="8" className="stroke-muted" />
          {ratio !== null ? <circle cx="10" cy="10" r="8" pathLength="100" className="stroke-chart-1"
            strokeDasharray={`${Math.min(Math.max(ratio, 0), 1) * 100} 100`} />
            : <circle cx="10" cy="10" r="8" pathLength="100" className="stroke-muted-foreground" strokeDasharray="4 8" />}
        </svg>
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" sideOffset={6} className="max-w-72 space-y-1">
      <p className="font-medium tabular-nums">{title}</p>
      {input !== null && <p className="tabular-nums">{formatCount(input)} {window
        ? i18n.formatMessage(messages.windowOf, { window: formatCount(window) }) : i18n.text(messages.tokens)}</p>}
      <p>{description}</p>
      {input !== null && <>
        {status && <p>{i18n.text(messages.reported)}</p>}
        {changed && <p>{i18n.formatMessage(messages.modelChanged, { model: measured.name })}</p>}
        <p>{i18n.text(messages.pending)}</p>
      </>}
    </TooltipContent>
  </Tooltip>;
}
