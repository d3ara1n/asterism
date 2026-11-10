import type { z } from "zod";
import { useI18n, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { CodeRows } from "@asterism-app/ui/code-view";
import { filesystemMessages as messages } from "../messages/filesystem";
import { textMessages } from "../messages/text";
import { inputText, searchHeaderSummary } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { SearchOptions } from "../filesystem/search-view";
import { grepSegments } from "../filesystem/search-layout";
import type { NoteGrep } from "./contract";

type Props = ToolRenderProps<z.infer<typeof NoteGrep.schema>>;
const stopMessages = {
  limit: messages.toolSearchLimit,
  output_bytes: messages.toolSearchOutputBytes,
  record_bytes: messages.toolSearchRecordBytes,
};

function Header({ args, invocation, result }: Props) {
  const i18n = useI18n(), data = result?.data;
  const summary = searchHeaderSummary(undefined, inputText(args, "pattern"));
  return <ToolHeader label={i18n.text(messages.toolDirectoryGrep)}
    subject={useToolResourceSubject(invocation.resource)}
    summary={summary && <span className="font-mono" title={summary}>{summary}</span>}
    meta={data && i18n.formatMessage(messages.toolSearchMatches, {
      count: data.rows.filter(row => row.match).length, truncated: data.stopReason !== null,
    })} />;
}

function Body({ args, target, result }: Props) {
  const i18n = useI18n(), data = result?.data;
  const segments = data && grepSegments(data.rows, TOOL_BODY_LINE_LIMIT);
  return <div className="flex flex-col gap-2">
    <SearchOptions args={args} target={target} />
    {segments?.map(segment => <CodeRows key={segment.rows[0].line} rows={segment.rows}
      dimmed={segment.rows.flatMap((row, index) => row.match ? [] : [index])} />)}
    {data && <>
      {!data.rows.length && <p className="type-caption">{i18n.text(data.stopReason === null
        ? messages.toolSearchNoLines : messages.toolSearchEmptyIncomplete)}</p>}
      {data.rows.length > TOOL_BODY_LINE_LIMIT && <p className="type-caption">
        {i18n.formatMessage(textMessages.toolTextPreviewOmitted, { count: data.rows.length - TOOL_BODY_LINE_LIMIT })}</p>}
      {data.stopReason !== null && <p className="type-caption">
        {i18n.formatMessage(stopMessages[data.stopReason], { unit: "rows" })}</p>}
    </>}
  </div>;
}

export const noteGrepViews = {
  input: { headerRenderer: Header },
  execution: { headerRenderer: Header, bodyRenderer: Body },
  result: { headerRenderer: Header, bodyRenderer: Body },
};
