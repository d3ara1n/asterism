import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { useI18n, useRendererTools } from "@asterism-app/sdk/renderer";
import { AlignLeft, Brain, ChevronsDownUp, ChevronsUpDown, Wrench } from "lucide-react";
import { conversationMessages } from "../../messages/conversation";
import { thinkingMessages } from "../../messages/thinking";
import type { TimelineItem } from "./timeline";
import { ConversationSeam } from "./ConversationSeam";
import { IconSwap } from "./IconSwap";
import type { ToolCallNode } from "./tool-state";
import { toolOutcomeTone } from "@asterism-app/ui/tool-outcome";

/** Distinct tools shown before the remainder collapses into a count. */
const visibleTools = 5;

function implementation(node: ToolCallNode): string | null {
  return ("outcome" in node ? node.outcome?.implementation?.id : undefined) ?? node.invocation?.implementation?.id ?? null;
}
function resultKind(node: ToolCallNode) {
  return "outcome" in node ? node.outcome?.kind ?? null : node.result?.kind ?? null;
}

/** Calls grouped by tool identity in first-use order. */
function toolGroups(tools: readonly ToolCallNode[]) {
  const groups = new Map<string, { key: string; node: ToolCallNode; count: number }>();
  for (const node of tools) {
    const key = JSON.stringify([node.name, implementation(node)]);
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { key, node, count: 1 });
  }
  return [...groups.values()];
}

export function ConversationProcess({ node, onToggle, onMount }: {
  node: Extract<TimelineItem, { kind: "conversation-process" }>;
  onToggle(): void;
  onMount(id: string, button: HTMLButtonElement): void;
}) {
  const i18n = useI18n();
  const tools = useRendererTools();
  const groups = toolGroups(node.tools);
  const tones = node.tools.flatMap(call => { const kind = resultKind(call); return kind && kind !== "running" ? [toolOutcomeTone(kind)] : []; });
  const failed = tones.filter(tone => tone === "error").length;
  const partial = tones.filter(tone => tone === "warning").length;
  return <ConversationSeam open={node.open} aria-expanded={node.open} onClick={onToggle} className="h-6"
    ref={button => { if (button) onMount(node.id, button); }}>
    <IconSwap swapKey={node.open ? "open" : "folded"}>{node.open ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}</IconSwap>
    <span className="shrink-0">{i18n.formatMessage(conversationMessages.executionProcess)}</span>
    {node.content.map(kind => <span key={kind} className="inline-flex shrink-0">
      {kind === "thinking" ? <Brain aria-hidden="true" className="size-3.5" /> : <AlignLeft aria-hidden="true" className="size-3.5" />}
      <span className="sr-only">{i18n.text(kind === "thinking" ? thinkingMessages.thinkingTitle : conversationMessages.processText)}</span>
    </span>)}
    {node.tools.length > 0 && <>
      <span className="sr-only">{i18n.formatMessage(conversationMessages.processToolCount, { count: node.tools.length })}</span>
      <span aria-hidden="true" className="flex min-w-0 items-center gap-2 overflow-hidden">
        {groups.slice(0, visibleTools).map(group => {
          const icon = tools.icon(group.node.name, implementation(group.node));
          const label = tools.label(group.node.name, implementation(group.node)) ?? group.node.name;
          return <TooltipHint key={group.key} content={label}><span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums [&_svg]:size-3.5">
            {icon ?? <Wrench />}{group.count > 1 && group.count}
          </span></TooltipHint>;
        })}
        {groups.length > visibleTools && <span className="shrink-0 tabular-nums">+{groups.length - visibleTools}</span>}
      </span>
    </>}
    {failed > 0 && <span className="shrink-0 text-destructive">· {i18n.formatMessage(conversationMessages.processFailedCount, { count: failed })}</span>}
    {partial > 0 && <span className="shrink-0">· {i18n.formatMessage(conversationMessages.processPartialCount, { count: partial })}</span>}
    {node.incomplete && <span className="shrink-0">· {i18n.formatMessage(conversationMessages.incomplete)}</span>}
    {node.notices > 0 && <span className="shrink-0">· {i18n.formatMessage(conversationMessages.processNoticeCount, { count: node.notices })}</span>}
    {node.compressions > 0 && <span className="shrink-0">· {i18n.formatMessage(conversationMessages.processCompressionCount, { count: node.compressions })}</span>}
  </ConversationSeam>;
}
