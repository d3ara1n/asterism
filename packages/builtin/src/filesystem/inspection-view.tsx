import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import type { z } from "zod";
import { File, FileQuestion, Folder, ScanSearch } from "lucide-react";
import { toolRenderer, useI18n, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { formatFileSize } from "@asterism-app/ui/format-file-size";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { Badge } from "@asterism-app/ui/ui/badge";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { filesystemMessages as messages } from "../messages/filesystem";
import { inputText } from "../shared/tool-preview";
import { InspectPathResult } from "./inspection-contract";
import { DirectoryListing } from "./list-view";

const kindMessages = {
  directory: messages.inspectKindDirectory, file: messages.inspectKindFile, other: messages.inspectKindOther,
};
const kindIcons = { directory: Folder, file: File, other: FileQuestion } as const;

type Props = ToolRenderProps<z.infer<typeof InspectPathResult.schema>>;
type Inspection = z.infer<typeof InspectPathResult.schema>;

/** The kind reads first, because it decides which of the remaining facts mean anything. */
function Kind({ data }: { data: Inspection }) {
  const i18n = useI18n();
  const Icon = data.type ? kindIcons[data.type] : FileQuestion;
  return <p className="flex min-w-0 items-center gap-1.5">
    <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="min-w-0 truncate">{i18n.text(data.type ? kindMessages[data.type] : messages.inspectMissing)}</span>
  </p>;
}

function Header({ args, result }: Props) {
  const i18n = useI18n();
  const data = result?.data;
  const path = data?.path ?? inputText(args, "path");
  return <ToolHeader label={i18n.text(messages.inspectPath)}
    summary={path && <TooltipHint content={path}><span className="font-mono">{path}</span></TooltipHint>}
    meta={data && (!data.exists ? <Badge variant="outline">{i18n.text(commonMessages.referenceMissing)}</Badge>
      : data.entries !== null ? i18n.formatMessage(messages.toolEntryCount, { count: data.entries.length, truncated: data.truncated })
        : data.size !== null ? formatFileSize(i18n, data.size) : undefined)} />;
}

/** A directory body is the shared one-level listing; a file has no entries, so its own facts are the body. */
function Body({ result }: Props) {
  const i18n = useI18n();
  const data = result?.data;
  if (!data) return null;
  if (data.entries !== null && data.type === "directory") {
    return <DirectoryListing data={{ path: data.path, entries: data.entries, truncated: data.truncated }} />;
  }
  return <div className="flex min-w-0 flex-col gap-1.5 type-caption">
    <Kind data={data} />
    {data.size !== null && <p className="text-muted-foreground">{formatFileSize(i18n, data.size)}</p>}
    {data.modifiedAt !== null && <p className="text-muted-foreground">
      {i18n.formatMessage(messages.inspectModified, { time: i18n.formatDate(Date.parse(data.modifiedAt), { dateStyle: "medium", timeStyle: "short" }) })}
    </p>}
  </div>;
}

export const inspectPathRenderer = toolRenderer(InspectPathResult, {
  label: messages.inspectPath, icon: <ScanSearch />,
  input: { headerRenderer: Header }, execution: { headerRenderer: Header },
  result: { headerRenderer: Header, bodyRenderer: Body },
});
