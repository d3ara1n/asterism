import { useI18n } from "@asterism-app/sdk/renderer";
import { Marker, MarkerContent, MarkerIcon } from "@asterism-app/ui/ui/marker";
import { StatusIcon } from "@asterism-app/ui/ui/status";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { conversationMessages } from "../../messages/conversation";
import { ExecutionErrorDetails } from "../ErrorDetails";
import { BlockStateLine } from "./Disclosure";
import type { TimelineItem } from "./timeline";

/**
 * One occurrence on a marker row: something happened without failing, so the row carries no tone of alarm and asks
 * nothing of the reader.
 */
export function OccurrenceRow({ children, details }: { children: ReactNode; details?: ReactNode }) {
  return <Marker className="min-h-8">
    <MarkerIcon><Info className="text-muted-foreground" /></MarkerIcon>
    <MarkerContent>{children}</MarkerContent>
    {details}
  </Marker>;
}

/**
 * An incident is a standalone diagnostic, not a state line on the output that preceded it.
 */
export function IncidentBlock({ message, details }: { message: ReactNode; details?: ReactNode }) {
  return <div data-tone="incident" className="surface-block px-3 py-2 text-sm">
    <BlockStateLine state="incident" />
    <div className="flex min-w-0 items-start gap-2">
      <StatusIcon tone="error" className="mt-0.5 size-3.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="whitespace-pre-wrap break-words">{message}</p>
        {details}
      </div>
    </div>
  </div>;
}

/** Inline feedback inside a turn states either what went wrong or what merely happened. */
export function FeedbackNotice({ node }: { node: Extract<TimelineItem, { kind: "notice" }> }) {
  const i18n = useI18n();
  const message = node.form === "occurrence" && node.omittedFiles
    ? i18n.formatMessage(conversationMessages.attachmentsOmitted, { files: node.omittedFiles.join(", ") })
    : node.message;
  if (node.form === "occurrence") return <OccurrenceRow>{message}</OccurrenceRow>;
  return <IncidentBlock message={message}
    {...(node.details ? { details: <ExecutionErrorDetails code={node.code} details={node.details} /> } : {})} />;
}
