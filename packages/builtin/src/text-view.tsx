import { textMessages } from "./messages/text";
import { formatCount } from "@atelier/ui/format-count";
import { toolsMessages } from "./messages/tools";
import { useI18n, type ToolRenderProps, type ToolRendererDefinition } from "@atelier/sdk/renderer";
import type { Json, ToolResult } from "@atelier/sdk/contracts";
import { useMemo } from "react";
import { FileDiff, type FileDiffOptions } from "@pierre/diffs/react";
import type { TextRead, TextChange } from "@atelier/builtin-api/contracts";
import { inputField, inputText, characterCount, toolTextTail, editPreviewText } from "./shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT, diffBodyPreview, textBodyPreview } from "./shared/tool-body";
import { displayText } from "./shared/text-row";
import { CodeRows } from "./code-view";
import { codeViewOptions } from "./shared/code-view";
import { ToolHeader } from "@atelier/ui/tool-header";
import { StreamingPreview } from "@atelier/ui/streaming-preview";

/** 三态复用摘要结构，已有路径、输入数量在执行和结束时继续保留。 */
function TextReadHeader({ target, invocation, result }: ToolRenderProps<TextRead>) {
  const i18n = useI18n();
  const path = inputText(target, "path");
  const data = result?.data;
  return <ToolHeader label={i18n.formatMessage(textMessages.toolTextRead)} monospace={path !== undefined}
    subject={[invocation.resource?.title, path].filter(Boolean).join(" / ")}
    meta={data && i18n.formatMessage(textMessages.toolTextLines, { shown: data.rows.length, total: data.totalLines })} />;
}
function TextWriteHeader({ target, args, invocation, result }: ToolRenderProps<TextChange>) {
  const i18n = useI18n();
  const path = inputText(target, "path");
  const content = inputText(args, "content");
  const count = useMemo(() => content === undefined ? undefined : characterCount(content), [content]);
  const data = result?.data;
  return <ToolHeader label={i18n.formatMessage(textMessages.toolTextWrite)} monospace={path !== undefined}
    subject={[invocation.resource?.title, path].filter(Boolean).join(" / ")}
    meta={<>{data && <>+{data.added} −{data.removed}{count !== undefined && " · "}</>}
      {count !== undefined && i18n.formatMessage(textMessages.toolTextCharacters, { count: formatCount(count) })}</>} />;
}
function TextEditHeader({ target, args, invocation, result }: ToolRenderProps<TextChange>) {
  const i18n = useI18n();
  const path = inputText(target, "path");
  const edits = inputField(args, "edits");
  const data = result?.data;
  return <ToolHeader label={i18n.formatMessage(textMessages.toolTextEdit)} monospace={path !== undefined}
    subject={[invocation.resource?.title, path].filter(Boolean).join(" / ")}
    meta={<>{data && <>+{data.added} −{data.removed}{Array.isArray(edits) && " · "}</>}
      {Array.isArray(edits) && i18n.formatMessage(textMessages.toolTextEdits, { count: edits.length })}</>} />;
}

function InputTail({ text, filename }: { text: string; filename?: string }) {
  const tail = toolTextTail(text).split("\n");
  const firstLine = text.split("\n").length - tail.length + 1;
  return <StreamingPreview><CodeRows rows={tail.map((content, index) => ({ line: firstLine + index, content }))} filename={filename} /></StreamingPreview>;
}
function EditPreview({ args }: { args: Json }) {
  return <InputTail text={editPreviewText(args)} />;
}
function TextWriteBody(props: ToolRenderProps<TextChange>) {
  const content = inputText(props.args, "content");
  const filename = inputText(props.target, "path");
  if (props.phase === "input") return <InputTail text={content ?? ""} filename={filename} />;
  if (props.result?.kind === "succeeded" && content !== undefined) return <TextBodyPreview text={content} filename={filename} />;
  return props.result?.data ? <TextChangeBody result={props.result} />
    : content !== undefined ? <TextBodyPreview text={content} filename={filename} /> : null;
}
function TextEditBody(props: ToolRenderProps<TextChange>) {
  return props.result?.data ? <TextChangeBody result={props.result} /> : <EditPreview args={props.args} />;
}

/** 用户视图消费保存的正文和差异，不显示或重新生成模型用的锚点。 */
function TextReadBody({ result, target }: ToolRenderProps<TextRead>) {
  const i18n = useI18n();
  const data = result?.data;
  const rows = data?.rows.slice(0, TOOL_BODY_LINE_LIMIT).map(row => ({ line: row.line, content: displayText(row) }));
  return data ? <div className="flex flex-col gap-2">
    <CodeRows rows={rows ?? []} filename={inputText(target, "path")} />
    <OmittedLines count={data.rows.length - (rows?.length ?? 0)} />
    {data.noFinalNewline && <p className="type-caption">{i18n.formatMessage(textMessages.toolTextNoFinalNewline)}</p>}
    {data.nextOffset !== null && <p className="type-caption">{i18n.formatMessage(textMessages.toolTextMore, { line: data.nextOffset })}</p>}
  </div> : null;
}
function TextChangeBody({ result }: { result: ToolResult<TextChange> | null }) {
  const i18n = useI18n();
  const data = result?.data;
  return data ? data.diff
    ? <DiffBodyPreview diff={data.diff} />
    : <p className="type-caption">{data.changed ? i18n.formatMessage(toolsMessages.toolNoOutput) : i18n.formatMessage(textMessages.toolTextUnchanged)}</p>
    : null;
}

function OmittedLines({ count }: { count: number }) {
  const i18n = useI18n();
  return count > 0 ? <p className="type-caption">{i18n.formatMessage(textMessages.toolTextPreviewOmitted, { count })}</p> : null;
}
function TextBodyPreview({ text, filename }: { text: string; filename?: string }) {
  const preview = useMemo(() => textBodyPreview(text), [text]);
  return <div className="space-y-2">
    <CodeRows rows={preview.rows} filename={filename} />
    <OmittedLines count={preview.omitted} />
  </div>;
}
function DiffBodyPreview({ diff }: { diff: string }) {
  const preview = useMemo(() => diffBodyPreview(diff), [diff]);
  if (!preview) return <TextBodyPreview text={diff} />;
  return <div className="space-y-2">
    <FileDiff fileDiff={preview.fileDiff} options={diffViewOptions} className="pierre-code type-code" disableWorkerPool />
    <OmittedLines count={preview.omitted} />
  </div>;
}

const diffViewOptions = {
  ...codeViewOptions, diffStyle: "unified", diffIndicators: "bars", lineDiffType: "none",
  hunkSeparators: "simple", expandUnchanged: false,
} as const satisfies FileDiffOptions<undefined, undefined>;

const readView = { headerRenderer: TextReadHeader, bodyRenderer: TextReadBody };
const writeView = { headerRenderer: TextWriteHeader, bodyRenderer: TextWriteBody };
const editView = { headerRenderer: TextEditHeader, bodyRenderer: TextEditBody };
export const textReadViews = {
  input: { headerRenderer: TextReadHeader }, execution: readView, result: readView,
} satisfies ToolRendererDefinition<TextRead>;
export const textWriteViews = {
  input: { ...writeView, streaming: ({ args }) => !!inputText(args, "content") },
  execution: writeView, result: writeView,
} satisfies ToolRendererDefinition<TextChange>;
export const textEditViews = {
  input: { ...editView, streaming: ({ args }) => editPreviewText(args).trim().length > 0 },
  execution: editView, result: editView,
} satisfies ToolRendererDefinition<TextChange>;
