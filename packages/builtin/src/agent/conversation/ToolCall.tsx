import { useI18n, useRendererTools, useRendererConfig } from "@asterism/sdk/renderer";
import { TextCursorInput, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { JsonView } from "@asterism/ui/json-view";
import { DefaultToolHeader, DefaultToolBody, ToolDetailsSwitcher } from "@asterism/ui/tool-content";
import { ToolHeader } from "@asterism/ui/tool-header";
import { Alert, AlertDescription } from "@asterism/ui/ui/alert";
import { StatusBadge, StatusIcon, type StatusTone } from "@asterism/ui/ui/status";
import { toolsMessages } from "../../messages/tools";
import { Disclosure } from "./Disclosure";
import { toolCallState, type ToolCallNode } from "./tool-state";
import { BuiltinSettings } from "../../settings/contract";
import { useStreamingDisclosure } from "../../shared/use-streaming-disclosure";
import { viewStateKeys } from "./view-state";

const labels = {
  partial: toolsMessages.toolPartial, failed: toolsMessages.toolFailed,
  rejected: toolsMessages.toolRejected, cancelled: toolsMessages.toolCancelled, unknown: toolsMessages.toolUnknown,
};

/** The shell manages only lifecycle and expansion; the two content entry points fall back independently, and updates or persistence do not reset expansion. */
export function ToolCall({ node }: { node: ToolCallNode }) {
  const i18n = useI18n();
  const tools = useRendererTools();
  const reducedMotion = useReducedMotion();
  const state = toolCallState(node);
  const preferences = useRendererConfig(BuiltinSettings);
  const filling = state.phase === "input";
  const view = state.props ? tools.resolve(state.props) : null;
  const hasInputBody = filling && view?.body !== undefined && view.body !== null;
  const stage = filling ? "input" : state.phase === "executing" ? "output" : null;
  const disclosure = useStreamingDisclosure(viewStateKeys.disclosure, stage,
    view?.streaming === true && view.body != null, preferences, view?.attention === true && view.body != null);
  const result = state.props?.result;
  const outcome = "outcome" in node ? node.outcome : null;
  const hasResultDetails = outcome && outcome.data !== null && outcome.model.every(part => part.kind === "text");
  const diagnostic = result && ("error" in result ? result.error.message : "message" in result ? result.message : null);
  const error = result?.kind === "failed" || result?.kind === "rejected" || result?.kind === "unknown";
  const status = state.phase === "ready" ? i18n.formatMessage(toolsMessages.toolWaiting) : state.phase === "incomplete" ? i18n.formatMessage(toolsMessages.toolIncomplete)
    : result && result.kind !== "running" && result.kind !== "succeeded" ? i18n.text(labels[result.kind]) : null;
  const tone: StatusTone = error ? "error" : state.phase === "ready" || result?.kind === "partial" ? "warning"
    : state.phase === "executing" ? "progress" : "neutral";
  const icon = state.phase === "input"
    ? <motion.span className="inline-flex" animate={reducedMotion ? undefined : { opacity: [0.45, 1, 0.45] }} transition={{ duration: 1.4, repeat: Infinity }}><TextCursorInput className="size-3.5" /></motion.span>
    : state.phase === "executing" ? <StatusIcon tone="progress" className="size-3.5" />
      : view?.icon ?? <Wrench className="size-3.5" />;
  const header = <>
    <span className="inline-flex shrink-0" aria-hidden="true">{icon}</span>
    <span className="min-w-0 flex-1 text-left">
      {view && (!filling || view.header !== undefined || view.body !== undefined || view.label !== undefined) ? view.header ?? <DefaultToolHeader props={view.props} label={view.label} />
        : <ToolHeader label={state.phase === "incomplete" ? i18n.formatMessage(toolsMessages.toolIncompleteRequest) : tools.preparation(node.name)} />}
    </span>
    {status && <StatusBadge tone={tone}>{status}</StatusBadge>}
    {state.phase === "settled" && result?.kind === "succeeded" && <span className="sr-only">{i18n.formatMessage(toolsMessages.toolSucceeded)}</span>}
  </>;
  return <Disclosure header={header} {...disclosure} expandable={!filling || hasInputBody}
    pending={state.phase === "input" || state.phase === "ready"}>
    <div className="space-y-3">
      {view && (view.body ?? (!filling && <DefaultToolBody {...view.props} />))}
      {diagnostic && <Alert variant={error ? "destructive" : "default"}><AlertDescription className="whitespace-pre-wrap">{diagnostic}</AlertDescription></Alert>}
      {state.phase === "settled" && <ToolDetailsSwitcher stateKey={viewStateKeys.toolDetails} items={[
        { value: "call", label: i18n.formatMessage(toolsMessages.toolCallDetails),
          render: () => <JsonView value={{ tool: node.name, arguments: node.arguments ?? node.argumentsText }} /> },
        ...(hasResultDetails ? [{ value: "result", label: i18n.formatMessage(toolsMessages.toolResultDetails),
          render: () => <JsonView value={JSON.stringify(outcome.data, null, 2)} /> }] : []),
      ]} />}
    </div>
  </Disclosure>;
}
