import { useI18n, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import type { z } from "zod";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { filesystemMessages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { inputText } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { DirectoryList } from "./contract";

type ListProps = ToolRenderProps<z.infer<typeof DirectoryList.schema>>;
function ListHeader({ target, invocation, result }: ListProps) {
  const i18n = useI18n();
  const path = inputText(target, "path");
  return <ToolHeader label={i18n.formatMessage(filesystemMessages.toolDirectoryList)} monospace
    subject={[invocation.resource?.title, path && path !== "." ? path : null].filter(Boolean).join(" / ")}
    meta={result?.data && i18n.formatMessage(filesystemMessages.toolEntryCount, { count: result.data.entries.length, truncated: result.data.truncated })} />;
}
function ListBody({ result }: ListProps) {
  const i18n = useI18n();
  const data = result?.data;
  return data ? <div className="flex flex-col gap-2">
    <p className="type-caption break-all">{data.path}</p>
    {!data.entries.length && <p className="type-caption">{i18n.formatMessage(filesystemMessages.toolDirectoryEmpty)}</p>}
    <ul className="type-code">{data.entries.slice(0, TOOL_BODY_LINE_LIMIT).map(entry =>
      <li key={entry.name} className="break-all">{entry.name}{entry.type === "directory" ? "/" : ""}</li>)}</ul>
    {data.entries.length > TOOL_BODY_LINE_LIMIT && <p className="type-caption">{i18n.formatMessage(textMessages.toolTextPreviewOmitted, { count: data.entries.length - TOOL_BODY_LINE_LIMIT })}</p>}
    {data.truncated && <p className="type-caption">{i18n.formatMessage(filesystemMessages.toolDirectoryTruncated)}</p>}
  </div> : null;
}
const listView = { headerRenderer: ListHeader, bodyRenderer: ListBody };
export const listViews = { input: { headerRenderer: ListHeader }, execution: listView, result: listView };
