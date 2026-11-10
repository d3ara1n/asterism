import { useI18n, useRendererTools } from "@asterism-app/sdk/renderer";
import { IconSummary, type IconSummaryItem } from "@asterism-app/ui/icon-summary";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { thinkingMessages } from "../../messages/thinking";
import { Button } from "@asterism-app/ui/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@asterism-app/ui/ui/marker";
import { AlignLeft, Brain, ChevronRight, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { conversationMessages } from "../../messages/conversation";
import type { TimelineItem } from "./timeline";
import { conversationTransition, immediateTransition } from "./motion";
import type { ToolCallNode } from "./tool-state";
import { toolOutcomeTone } from "@asterism-app/ui/tool-outcome";

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

/** The summary sits at the end of the process; expanded original items appear above the button. */
export function ConversationProcess({ node, onToggle, onMount }: {
  node: Extract<TimelineItem, { kind: "conversation-process" }>;
  onToggle(): void;
  onMount(id: string, button: HTMLButtonElement): void;
}) {
  const i18n = useI18n();
  const tools = useRendererTools();
  const reducedMotion = useReducedMotion();
  const items: IconSummaryItem[] = [
    ...node.content.map(kind => ({
      key: kind,
      icon: kind === "thinking" ? <Brain className="size-3.5" /> : <AlignLeft className="size-3.5" />,
      label: i18n.text(kind === "thinking" ? thinkingMessages.thinkingTitle : conversationMessages.processText),
    })),
    ...toolGroups(node.tools).map(group => ({
      key: group.key,
      icon: tools.icon(group.node.name, implementation(group.node)) ?? <Wrench className="size-3.5" />,
      label: tools.label(group.node.name, implementation(group.node)) ?? group.node.name,
      count: group.count,
    })),
  ];
  const tones = node.tools.flatMap(call => { const kind = resultKind(call); return kind && kind !== "running" ? [toolOutcomeTone(kind)] : []; });
  const failed = tones.filter(tone => tone === "error").length;
  const partial = tones.filter(tone => tone === "warning").length;
  return <Marker variant="separator" asChild><Button type="button" variant="ghost" size="sm" aria-expanded={node.open} onClick={onToggle}
    ref={button => { if (button) onMount(node.id, button); }}
    className="w-full gap-2 px-0 text-xs font-normal text-muted-foreground before:w-3 before:flex-none after:w-3 after:flex-none">
    <MarkerIcon className="size-3.5"><motion.span className="block" initial={false}
      animate={{ rotate: node.open ? -90 : 0 }} transition={reducedMotion ? immediateTransition : conversationTransition}>
      <ChevronRight className="size-3.5" />
    </motion.span></MarkerIcon>
    <MarkerContent className="min-w-0 flex-1 group-data-[variant=separator]/marker:flex-1">
      <ToolHeader label={i18n.text(conversationMessages.executionProcess)}
        summary={items.length ? <IconSummary items={items} /> : undefined}
        meta={<>
          {node.tools.length > 0 && i18n.formatMessage(conversationMessages.processToolCount, { count: node.tools.length })}
          {failed > 0 && <> · {i18n.formatMessage(conversationMessages.processFailedCount, { count: failed })}</>}
          {partial > 0 && <> · {i18n.formatMessage(conversationMessages.processPartialCount, { count: partial })}</>}
          {node.incomplete && <>{node.tools.length > 0 && " · "}{i18n.formatMessage(conversationMessages.incomplete)}</>}
        </>} />
    </MarkerContent>
  </Button></Marker>;
}
