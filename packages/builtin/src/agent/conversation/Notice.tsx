import { useI18n } from "@asterism-app/sdk/renderer";
import { Marker, MarkerContent, MarkerIcon } from "@asterism-app/ui/ui/marker";
import { StatusIcon } from "@asterism-app/ui/ui/status";
import { conversationMessages } from "../../messages/conversation";
import { ExecutionErrorDetails } from "../ErrorDetails";
import { BlockStateLine } from "./Disclosure";
import type { TimelineItem } from "./timeline";

export function ExecutionNotice({ node }: { node: Extract<TimelineItem, { kind: "notice" }> }) {
  const i18n = useI18n();
  const message = node.omittedFiles
    ? i18n.formatMessage(conversationMessages.attachmentsOmitted, { files: node.omittedFiles.join(", ") })
    : node.message;
  if (node.level === "warning") return <Marker className="min-h-8">
    <MarkerIcon><StatusIcon tone="warning" className="size-3.5" /></MarkerIcon>
    <MarkerContent>{message}</MarkerContent>
    {node.details && <ExecutionErrorDetails code={node.code} details={node.details} />}
  </Marker>;
  return <div data-tone="failed" className="surface-block px-3 py-2 text-sm">
    <BlockStateLine state="failed" />
    <div className="flex min-w-0 items-start gap-2">
      <StatusIcon tone="error" className="mt-0.5 size-3.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="whitespace-pre-wrap break-words">{message}</p>
        {node.details && <ExecutionErrorDetails code={node.code} details={node.details} />}
      </div>
    </div>
  </div>;
}
