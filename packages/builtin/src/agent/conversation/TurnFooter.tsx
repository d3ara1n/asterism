import { useContext, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@asterism-app/sdk/renderer";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { turnMetricMessages as messages } from "../../messages/turn-metrics";
import type { TurnMetricsData } from "./turn-metrics";
import { TurnMetrics } from "./TurnMetrics";
import { MessageTimestamp } from "./MessageTimestamp";

import { ConversationShareContext } from "./share/share-context";
import { shareMessages } from "../../messages/share";

export function TurnFooter({ inputId, metrics, incomplete, replyMarkdown, replyCreatedAt }: {
  inputId: string; metrics: TurnMetricsData; incomplete: boolean; replyMarkdown: string | null; replyCreatedAt: string | null;
}) {
  const share = useContext(ConversationShareContext);
  const i18n = useI18n();
  return <div className="group/turn grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
    <div className="min-w-0"><TurnMetrics metrics={metrics} incomplete={incomplete} /></div>
    {replyMarkdown !== null && <div className="flex items-center gap-2">
      {replyCreatedAt !== null && <MessageTimestamp createdAt={replyCreatedAt} />}
      <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover/turn:opacity-100 has-[:focus-visible]:opacity-100">
        <CopyReply markdown={replyMarkdown} />
        {share && <IconButton size="icon-xs" label={i18n.text(shareMessages.share)} onClick={event => share(`turn-metrics:${inputId}`, event.currentTarget)}><Share2 /></IconButton>}
      </div>
    </div>}
  </div>;
}

function CopyReply({ markdown }: { markdown: string }) {
  const i18n = useI18n();
  const [copying, setCopying] = useState(false);
  const copy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success(i18n.text(messages.copied));
    } catch (error) {
      console.error("Reply could not be copied.", error);
      toast.error(i18n.text(messages.copyFailed));
    } finally {
      setCopying(false);
    }
  };
  return <IconButton size="icon-xs"
    label={i18n.text(messages.copyReply)} disabled={copying} onClick={() => { void copy(); }}>
    <Copy />
  </IconButton>;
}
