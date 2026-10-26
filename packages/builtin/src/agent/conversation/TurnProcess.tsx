import { useI18n } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@atelier/ui/ui/marker";
import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { conversationMessages } from "../../messages/conversation";
import type { TimelineItem } from "./timeline";
import { conversationTransition, immediateTransition } from "./motion";

/** 概要位于过程末尾；展开的原有条目出现在按钮上方。 */
export function TurnProcess({ node, onToggle, onMount }: {
  node: Extract<TimelineItem, { kind: "turn-process" }>;
  onToggle(): void;
  onMount(id: string, button: HTMLButtonElement): void;
}) {
  const i18n = useI18n();
  const reducedMotion = useReducedMotion();
  return <Marker variant="separator" asChild><Button type="button" variant="ghost" size="sm" aria-expanded={node.open} onClick={onToggle}
    ref={button => { if (button) onMount(node.id, button); }}
    className="w-full gap-2 px-0 text-xs font-normal text-muted-foreground">
    <MarkerIcon className="size-3.5"><motion.span className="block" initial={false}
      animate={{ rotate: node.open ? -90 : 0 }} transition={reducedMotion ? immediateTransition : conversationTransition}>
      <ChevronRight className="size-3.5" />
    </motion.span></MarkerIcon>
    <MarkerContent className="truncate">{i18n.formatMessage(conversationMessages.executionProcess)}
    {node.toolCount > 0 && <span>
      · {i18n.formatMessage(conversationMessages.processToolCount, { count: node.toolCount })}
    </span>}
    {node.incomplete && <span>· {i18n.formatMessage(conversationMessages.incomplete)}</span>}
    </MarkerContent>
  </Button></Marker>;
}
