import { useI18n } from "@asterism-app/sdk/renderer";
import { StatusIcon, type StatusTone } from "@asterism-app/ui/ui/status";
import { CircleStop, type LucideIcon } from "lucide-react";
import { conversationMessages } from "../../messages/conversation";
import { explainsOutcome, type TurnOutcome } from "../state";
import type { TimelineItem } from "./timeline";

/**
 * A turn ending that the reader has to be told about. A stop is the user's own action, so it stays neutral; a failure
 * carries the error tone. The tone and icon come from the shared status layer rather than this file.
 */
const endings: Record<"cancelled" | "failed", { tone: StatusTone; icon?: LucideIcon; label: keyof typeof conversationMessages }> = {
  cancelled: { tone: "neutral", icon: CircleStop, label: "turnCancelled" },
  failed: { tone: "error", icon: undefined, label: "turnFailed" },
};

export function TurnOutcomeMarker({ node }: { node: Extract<TimelineItem, { kind: "turn-outcome" }> }) {
  const i18n = useI18n();
  if (!explainsOutcome(node.outcome)) return null;
  const ending = endings[node.outcome as Exclude<TurnOutcome, "completed" | "incomplete">];
  return <p data-turn-outcome={node.outcome} className="type-caption flex min-w-0 items-center gap-1.5 text-muted-foreground">
    <StatusIcon tone={ending.tone} icon={ending.icon} className="size-3.5 shrink-0" />
    <span className="min-w-0 break-words">{i18n.text(conversationMessages[ending.label])}</span>
  </p>;
}
