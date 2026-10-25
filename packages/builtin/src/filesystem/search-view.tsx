import { FileSearch, Search } from "lucide-react";
import { toolRenderer, useI18n, type ToolRenderProps } from "@atelier/sdk/renderer";
import { ToolHeader } from "@atelier/ui/tool-header";
import { filesystemMessages as messages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { inputText } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { DirectoryFind, DirectoryGrep, type FindResult, type GrepResult, type SearchStopReason } from "./search-contract";
import { searchSummary } from "./search-presentation";

const stopMessages = {
  limit: messages.toolSearchLimit,
  output_bytes: messages.toolSearchOutputBytes,
  record_bytes: messages.toolSearchRecordBytes,
} satisfies Record<Exclude<SearchStopReason, null>, typeof messages.toolSearchLimit>;

function Header(props: ToolRenderProps<FindResult | GrepResult> & { grep?: boolean }) {
  const i18n = useI18n(), data = props.result?.data;
  const summary = data ? searchSummary(data) : undefined;
  return <ToolHeader label={i18n.text(props.grep ? messages.toolDirectoryGrep : messages.toolDirectoryFind)} monospace
    subject={[props.invocation.resource?.title, inputText(props.target, "path"), inputText(props.args, "pattern")].filter(Boolean).join(" / ")}
    meta={summary && i18n.formatMessage(messages.toolSearchSummary, {
      count: summary.returned, unit: summary.unit, matches: summary.matching ?? 0, complete: summary.complete,
    })} />;
}
function FindHeader(props: ToolRenderProps<FindResult>) { return <Header {...props} />; }
function GrepHeader(props: ToolRenderProps<GrepResult>) { return <Header {...props} grep />; }

function Body({ result }: ToolRenderProps<FindResult | GrepResult>) {
  const i18n = useI18n(), data = result?.data;
  if (!data) return null;
  const summary = searchSummary(data);
  const lines = "rows" in data
    ? data.mode === "content"
      ? data.rows.map(row => row.kind === "omitted"
        ? `${JSON.stringify(row.path)}:${row.line} — ${i18n.formatMessage(messages.toolSearchLineOmitted, { match: row.match })}`
        : `${JSON.stringify(row.path)}:${row.line}${row.hash ? `#${row.hash}` : ""}│${row.content}`)
      : data.files.map(file => `${JSON.stringify(file.path)}${file.count === null ? "" : `: ${file.count}`}`)
    : data.files.map(path => JSON.stringify(path));
  return <div className="flex flex-col gap-2">
    <pre className="type-code m-0 max-h-96 overflow-auto whitespace-pre-wrap break-all">{lines.length
      ? lines.slice(0, TOOL_BODY_LINE_LIMIT).join("\n") : i18n.text(summary.empty === "incomplete"
        ? messages.toolSearchEmptyIncomplete : summary.unit === "rows" ? messages.toolSearchNoLines : messages.directoryNoMatches)}</pre>
    {lines.length > TOOL_BODY_LINE_LIMIT && <p className="type-caption">{i18n.formatMessage(textMessages.toolTextPreviewOmitted, { count: lines.length - TOOL_BODY_LINE_LIMIT })}</p>}
    {data.stopReason !== null && <p className="type-caption">{i18n.text(stopMessages[data.stopReason])}</p>}
  </div>;
}
export const searchToolRenderers = [
  toolRenderer(DirectoryFind, {
    label: messages.toolDirectoryFind, icon: <FileSearch className="size-3.5" />,
    input: { headerRenderer: FindHeader }, execution: { headerRenderer: FindHeader },
    result: { headerRenderer: FindHeader, bodyRenderer: Body },
  }),
  toolRenderer(DirectoryGrep, {
    label: messages.toolDirectoryGrep, icon: <Search className="size-3.5" />,
    input: { headerRenderer: GrepHeader }, execution: { headerRenderer: GrepHeader },
    result: { headerRenderer: GrepHeader, bodyRenderer: Body },
  }),
];
