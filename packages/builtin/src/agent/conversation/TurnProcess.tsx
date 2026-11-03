import { useI18n, useRendererTools } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@asterism-app/ui/ui/marker";
import { ChevronRight, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { conversationMessages } from "../../messages/conversation";
import type { TimelineItem } from "./timeline";
import { conversationTransition, immediateTransition } from "./motion";
import { toolCallState, type ToolCallNode } from "./tool-state";

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

/** The summary sits at the end of the process; expanded original items appear above the button. */
export function TurnProcess({ node, onToggle, onMount }: {
  node: Extract<TimelineItem, { kind: "turn-process" }>;
  onToggle(): void;
  onMount(id: string, button: HTMLButtonElement): void;
}) {
  const i18n = useI18n();
  const tools = useRendererTools();
  const reducedMotion = useReducedMotion();
  const groups = toolGroups(node.tools);
  const kinds = node.tools.map(resultKind);
  const failed = kinds.filter(kind => kind === "failed" || kind === "rejected" || kind === "unknown").length;
  const partial = kinds.filter(kind => kind === "partial").length;
  return <Marker variant="separator" asChild><Button type="button" variant="ghost" size="sm" aria-expanded={node.open} onClick={onToggle}
    ref={button => { if (button) onMount(node.id, button); }}
    className="w-full gap-2 px-0 text-xs font-normal text-muted-foreground">
    <MarkerIcon className="size-3.5"><motion.span className="block" initial={false}
      animate={{ rotate: node.open ? -90 : 0 }} transition={reducedMotion ? immediateTransition : conversationTransition}>
      <ChevronRight className="size-3.5" />
    </motion.span></MarkerIcon>
    <MarkerContent className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0">{i18n.formatMessage(conversationMessages.executionProcess)}</span>
      {node.tools.length > 0 && <>
        <span className="sr-only">{i18n.formatMessage(conversationMessages.processToolCount, { count: node.tools.length })}</span>
        <span aria-hidden="true" className="flex min-w-0 items-center gap-2 overflow-hidden">
          {groups.slice(0, visibleTools).map(group => {
            const props = toolCallState(group.node).props;
            const icon = props ? tools.resolve(props).icon : undefined;
            const label = tools.label(group.node.name, implementation(group.node)) ?? group.node.name;
            return <span key={group.key} title={label} className="inline-flex shrink-0 items-center gap-0.5 tabular-nums [&_svg]:size-3.5">
              {icon ?? <Wrench />}{group.count > 1 && group.count}
            </span>;
          })}
          {groups.length > visibleTools && <span className="shrink-0 tabular-nums">+{groups.length - visibleTools}</span>}
        </span>
      </>}
      {failed > 0 && <span className="shrink-0 text-destructive">· {i18n.formatMessage(conversationMessages.processFailedCount, { count: failed })}</span>}
      {partial > 0 && <span className="shrink-0">· {i18n.formatMessage(conversationMessages.processPartialCount, { count: partial })}</span>}
      {node.incomplete && <span className="shrink-0">· {i18n.formatMessage(conversationMessages.incomplete)}</span>}
    </MarkerContent>
  </Button></Marker>;
}
