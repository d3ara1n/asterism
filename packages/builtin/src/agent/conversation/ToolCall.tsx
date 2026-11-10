import { useI18n, useRendererTools, useRendererConfig } from "@asterism-app/sdk/renderer";
import { TextCursorInput, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { JsonView } from "@asterism-app/ui/json-view";
import { DefaultToolHeader, DefaultToolBody, ToolDetailsSwitcher } from "@asterism-app/ui/tool-content";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { StatusBadge, StatusIcon } from "@asterism-app/ui/ui/status";
import { cn } from "@asterism-app/ui/utils";
import { toolOutcomeLabels, toolOutcomeTone } from "@asterism-app/ui/tool-outcome";
import { toolsMessages } from "../../messages/tools";
import { Disclosure } from "./Disclosure";
import { toolCallState, type ToolCallNode } from "./tool-state";
import { BuiltinSettings } from "../../settings/contract";
import { useStreamingDisclosure } from "../../shared/use-streaming-disclosure";
import { viewStateKeys } from "./view-state";
import { blockShell } from "./block-shell";
import { IconSwap } from "./IconSwap";

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
  const settled = result && result.kind !== "running" ? result.kind : null;
  // Request-level failure belongs to the outer shell and notice; the badge reports how local execution ended.
  const status = settled && settled !== "succeeded" ? i18n.text(toolOutcomeLabels[settled]) : null;
  const icon = state.phase === "input"
    ? <motion.span className="inline-flex" animate={reducedMotion ? undefined : { opacity: [0.45, 1, 0.45] }} transition={{ duration: 1.4, repeat: Infinity }}><TextCursorInput className="size-3.5" /></motion.span>
    : state.phase === "executing" ? <StatusIcon tone="progress" className="size-3.5" />
      : view?.icon ?? <Wrench className="size-3.5" />;
  const iconKey = state.phase === "input" ? "input" : state.phase === "executing" ? "executing" : "icon";
  const header = <>
    <IconSwap swapKey={iconKey}>{icon}</IconSwap>
    <span className="min-w-0 flex-1 text-left">
      {view && (!filling || view.header !== undefined || view.body !== undefined || view.label !== undefined) ? view.header ?? <DefaultToolHeader props={view.props} label={view.label} />
        : <ToolHeader label={state.phase === "incomplete" ? tools.label(node.name, node.invocation?.implementation?.id ?? null) ?? node.name : tools.preparation(node.name)} />}
    </span>
    {status && settled && <StatusBadge tone={toolOutcomeTone(settled)}>{status}</StatusBadge>}
    {state.phase === "settled" && settled === "succeeded" && <span className="sr-only">{i18n.text(toolOutcomeLabels.succeeded)}</span>}
  </>;
  return <Disclosure header={header} {...disclosure} {...blockShell(node)} expandable={!filling || hasInputBody}
    pending={state.phase === "input" || state.phase === "ready"}>
    <div className="space-y-3 [--code-font-size:var(--text-xs)]">
      {view && (view.body ?? (!filling && state.phase !== "incomplete" && <DefaultToolBody {...view.props} />))}
      {diagnostic && <p className={cn("type-caption whitespace-pre-wrap", "error" in result && "text-destructive")}>{diagnostic}</p>}
      {view?.details !== false && (state.phase === "settled" || state.phase === "incomplete") && <ToolDetailsSwitcher stateKey={viewStateKeys.toolDetails} items={[
        { value: "call", label: i18n.formatMessage(toolsMessages.toolCallDetails),
          render: () => <JsonView value={{ tool: node.name, arguments: node.arguments ?? node.argumentsText }} /> },
        ...(hasResultDetails ? [{ value: "result", label: i18n.formatMessage(toolsMessages.toolResultDetails),
          render: () => <JsonView value={JSON.stringify(outcome.data, null, 2)} /> }] : []),
      ]} />}
    </div>
  </Disclosure>;
}
