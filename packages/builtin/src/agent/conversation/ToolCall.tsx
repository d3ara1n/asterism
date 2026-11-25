import { HeaderExcerpt, StreamingScrollArea, useI18n, useRendererTools, useRendererConfig } from "@asterism-app/sdk/renderer";
import { useMemo } from "react";
import { TextCursorInput, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { JsonView } from "@asterism-app/ui/json-view";
import { DefaultToolHeader, DefaultToolBody, ToolDetailsSwitcher, useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { StatusIcon, StatusLabel } from "@asterism-app/ui/ui/status";
import { isToolError, toolOutcomeLabels, toolOutcomeTone } from "@asterism-app/ui/tool-outcome";
import { ToolOutcomeNotice } from "@asterism-app/ui/tool-failure";
import { toolsMessages } from "../../messages/tools";
import { Disclosure } from "./Disclosure";
import { toolCallState, type ToolCallNode } from "./tool-state";
import { BuiltinSettings } from "../../settings/contract";
import { useStreamingDisclosure } from "../../shared/use-streaming-disclosure";
import { viewStateKeys } from "./view-state";
import { blockLine } from "./block-shell";
import { IconSwap } from "./IconSwap";
import { toolTextTail } from "../../shared/tool-preview";

/** The shell manages only lifecycle and expansion; the two content entry points fall back independently, and updates or persistence do not reset expansion. */
export function ToolCall({ node }: { node: ToolCallNode }) {
  const i18n = useI18n();
  const tools = useRendererTools();
  const reducedMotion = useReducedMotion();
  const state = toolCallState(node);
  const preferences = useRendererConfig(BuiltinSettings);
  const filling = state.phase === "input";
  const view = tools.resolve(state.props);
  const freeform = view.props.kind === "freeform" ? view.props.text : null;
  const subject = useToolResourceSubject(view.props.invocation.resource);
  const fallbackPreview = filling && freeform !== null && freeform.length > 0 && view.body == null;
  const hasInputBody = filling && (view.body != null || fallbackPreview);
  const stage = filling ? "input" : state.phase === "executing" ? "output" : null;
  const disclosure = useStreamingDisclosure(viewStateKeys.disclosure, stage,
    (view.streaming === true && view.body != null) || fallbackPreview, preferences, view.attention === true && view.body != null);
  const result = state.props.result;
  const settled = result && result.kind !== "running" ? result.kind : null;
  const toolError = settled !== null && isToolError(settled);
  const status = settled && settled !== "succeeded" ? i18n.text(toolOutcomeLabels[settled]) : null;
  const icon = state.phase === "input"
    ? <motion.span className="inline-flex" animate={reducedMotion ? undefined : { opacity: [0.45, 1, 0.45] }} transition={{ duration: 1.4, repeat: Infinity }}><TextCursorInput className="size-3.5" /></motion.span>
    : state.phase === "executing" ? <StatusIcon tone="progress" className="size-3.5" />
      : view.icon ?? <Wrench className="size-3.5" />;
  const iconKey = state.phase === "input" ? "input" : state.phase === "executing" ? "executing" : "icon";
  const header = <>
    <IconSwap swapKey={iconKey}>{icon}</IconSwap>
    <span className="min-w-0 flex-1 text-left">
      {freeform !== null && view.header == null ? <ToolHeader label={view.label ? i18n.text(view.label) : view.props.name}
        subject={subject} summary={<HeaderExcerpt text={freeform} />} />
      : !filling || view.header !== undefined || view.body !== undefined || view.label !== undefined ? view.header ?? <DefaultToolHeader props={view.props} label={view.label} />
        : <ToolHeader label={state.phase === "incomplete" ? tools.label(node.name, node.invocation?.implementation?.id ?? null) ?? node.name : tools.preparation(node.name)} />}
    </span>
    {status && settled && <StatusLabel tone={toolOutcomeTone(settled)} className="shrink-0 type-caption">{status}</StatusLabel>}
    {state.phase === "settled" && settled === "succeeded" && <span className="sr-only">{i18n.text(toolOutcomeLabels.succeeded)}</span>}
  </>;
  return <Disclosure header={header} {...disclosure} line={blockLine(node)} tone={toolError ? "failed" : undefined}
    expandable={!filling || hasInputBody} noticeAt={"noticeAt" in node ? node.noticeAt : undefined}>
    <div className="space-y-3 [--code-font-size:var(--text-xs)]">
      <ToolOutcomeNotice result={result} />
      {view.body ?? (fallbackPreview ? <StreamingScrollArea label={i18n.formatMessage(toolsMessages.toolCallDetails)}>
        <JsonView value={toolTextTail(freeform)} scrollable={false} />
      </StreamingScrollArea> : !filling && state.phase !== "incomplete" && <DefaultToolBody {...view.props} />)}
      {view.details !== false && (state.phase === "settled" || state.phase === "incomplete") && <ToolCallDetails node={node} />}
    </div>
  </Disclosure>;
}

function ToolCallDetails({ node }: { node: ToolCallNode }) {
  const i18n = useI18n();
  const outcome = "outcome" in node ? node.outcome : null;
  const { call, result, model } = useMemo(() => {
    const call = node.draft?.text ?? (node.input?.kind === "freeform" ? node.input.text
      : JSON.stringify({ tool: node.name, arguments: node.input?.value ?? null }, null, 2));
    // Raw result details stay reachable for every ending, including the error an unsuccessful outcome records.
    const result = outcome && outcome.model.every(part => part.kind === "text")
      ? JSON.stringify(outcome.kind === "succeeded" || outcome.kind === "partial" ? outcome.data : outcome, null, 2) : null;
    const model = outcome?.model.map(part => part.kind === "text" ? part.text : JSON.stringify(part, null, 2)) ?? [];
    return { call, result, model };
  }, [node.name, node.input, node.draft, outcome]);
  return <ToolDetailsSwitcher stateKey={viewStateKeys.toolDetails} items={[
    { value: "call", label: i18n.formatMessage(toolsMessages.toolCallDetails), text: call },
    ...(result !== null ? [{ value: "result", label: i18n.formatMessage(toolsMessages.toolResultDetails), text: result }] : []),
    ...(model.length > 0 ? [{ value: "model", label: i18n.formatMessage(toolsMessages.toolModelDetails), text: model }] : []),
  ]} />;
}
