import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@atelier/sdk/renderer";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { turnMetricMessages as messages } from "../../messages/turn-metrics";
import type { TurnMetricsData } from "./turn-metrics";
import { TurnMetrics } from "./TurnMetrics";

export function TurnFooter({ metrics, incomplete, replyMarkdown }: {
  metrics: TurnMetricsData; incomplete: boolean; replyMarkdown: string | null;
}) {
  return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
    <div className="min-w-0"><TurnMetrics metrics={metrics} incomplete={incomplete} /></div>
    {replyMarkdown !== null && <CopyReply markdown={replyMarkdown} />}
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
  return <IconButton size="icon-xs" className="mt-0.5"
    label={i18n.text(messages.copyReply)} disabled={copying} onClick={() => { void copy(); }}>
    <Copy />
  </IconButton>;
}
