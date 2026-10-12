import { useI18n, useRendererTools } from "@atelier/sdk/renderer";
import { TextCursorInput, Clock, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { JsonView } from "../../../renderer/shared/json-view";
import { DefaultToolHeader, DefaultToolBody, ToolDetails } from "../../../renderer/shared/tool-content";
import { ToolHeader } from "../../../renderer/shared/tool-header";
import { Alert, AlertDescription } from "../../../renderer/shared/ui/alert";
import { Badge } from "../../../renderer/shared/ui/badge";
import { Spinner } from "../../../renderer/shared/ui/spinner";
import { toolsMessages } from "../../messages/tools";
import { Disclosure } from "./Disclosure";
import { toolCallState, type ToolCallNode } from "./tool-state";

const labels = {
  running: toolsMessages.toolRunning, partial: toolsMessages.toolPartial, failed: toolsMessages.toolFailed,
  rejected: toolsMessages.toolRejected, cancelled: toolsMessages.toolCancelled, unknown: toolsMessages.toolUnknown,
};

/** 外壳只管理生命周期和展开；两个内容入口独立回退，更新和落库不重置展开。 */
export function ToolCall({ node }: { node: ToolCallNode }) {
  const i18n = useI18n();
  const tools = useRendererTools();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const state = toolCallState(node);
  const view = state.props ? tools.resolve(state.props) : null;
  const result = state.props?.result;
  const diagnostic = result && ("error" in result ? result.error.message : "message" in result ? result.message : null);
  const error = result?.kind === "failed" || result?.kind === "rejected" || result?.kind === "unknown";
  const status = state.phase === "ready" ? i18n.formatMessage(toolsMessages.toolWaiting) : state.phase === "incomplete" ? i18n.formatMessage(toolsMessages.toolIncomplete)
    : result && result.kind !== "succeeded" ? i18n.text(labels[result.kind]) : null;
  const icon = state.phase === "input"
    ? <motion.span className="inline-flex" animate={reducedMotion ? undefined : { opacity: [0.45, 1, 0.45] }} transition={{ duration: 1.4, repeat: Infinity }}><TextCursorInput className="size-3.5" /></motion.span>
    : state.phase === "ready" ? <Clock className="size-3.5" />
      : state.phase === "executing" ? <Spinner className="size-3.5 motion-reduce:animate-none" />
        : view?.icon ?? <Wrench className="size-3.5" />;
  const header = <>
    <span className="inline-flex shrink-0" aria-hidden="true">{icon}</span>
    <span className="min-w-0 flex-1 text-left">
      {view ? view.header ?? <DefaultToolHeader props={view.props} label={view.label} />
        : <ToolHeader label={state.phase === "incomplete" ? i18n.formatMessage(toolsMessages.toolIncompleteRequest) : tools.preparation(node.name)} />}
    </span>
    {status && <Badge variant={error ? "destructive" : "secondary"}>{status}</Badge>}
    {state.phase === "settled" && result?.kind === "succeeded" && <span className="sr-only">{i18n.formatMessage(toolsMessages.toolSucceeded)}</span>}
  </>;
  return <Disclosure header={header} open={open} onOpenChange={setOpen} expandable={state.expandable}
    pending={state.phase === "input" || state.phase === "ready"}>
    {view && (view.body ?? <DefaultToolBody {...view.props} />)}
    {diagnostic && <Alert variant={error ? "destructive" : "default"}><AlertDescription className="whitespace-pre-wrap">{diagnostic}</AlertDescription></Alert>}
    <ToolDetails label={i18n.formatMessage(toolsMessages.toolCallDetails)}><JsonView value={{ tool: node.name, arguments: node.arguments }} /></ToolDetails>
  </Disclosure>;
}
