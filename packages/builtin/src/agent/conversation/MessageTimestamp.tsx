import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { useI18n } from "@asterism-app/sdk/renderer";
import { messageTimeOptions } from "./message-time";

export function MessageTimestamp({ createdAt }: { createdAt: string }) {
  const i18n = useI18n();
  const date = new Date(createdAt);
  const fullTime = i18n.formatDate(date.getTime(), {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  });
  return <TooltipHint content={fullTime}><time dateTime={createdAt} className="type-caption tabular-nums">
    {i18n.formatDate(date.getTime(), messageTimeOptions(date, new Date()))}
  </time></TooltipHint>;
}
