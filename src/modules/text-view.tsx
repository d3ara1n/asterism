import { textMessages } from "./messages/text";
import { toolsMessages } from "./messages/tools";
import { useI18n, type ToolRenderProps, type ToolRendererDefinition } from "@atelier/sdk/renderer";
import type { Json, ToolResult } from "@atelier/sdk/contracts";
import { useMemo } from "react";
import type { TextRead, TextChange } from "./shared/text-contract";
import { inputField, inputText, characterCount, toolTextTail } from "./shared/tool-preview";
import { ToolHeader } from "../renderer/shared/tool-header";

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
      {count !== undefined && i18n.formatMessage(textMessages.toolTextCharacters, { count })}</>} />;
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

function InputTail({ text }: { text: string }) {
  return <div className="tool-input-preview" aria-live="off">
    <pre className="min-w-0 shrink-0 whitespace-pre-wrap break-words type-code">{toolTextTail(text)}</pre>
  </div>;
}
function EditPreview({ args }: { args: Json }) {
  const edits = inputField(args, "edits");
  const text = Array.isArray(edits) ? edits.slice(-8).map(edit => {
    const body = inputField(edit, "body");
    const anchor = inputField(edit, "anchor");
    const line = anchor === undefined ? undefined : inputField(anchor, "line");
    return [inputText(edit, "op"), typeof line === "number" ? `L${line}` : null,
      Array.isArray(body) ? body.slice(-80).filter((row): row is string => typeof row === "string").map(toolTextTail).join("\n") : null]
      .filter(value => value !== null && value !== undefined).join("\n");
  }).join("\n\n") : "";
  return <InputTail text={text} />;
}
function TextWriteBody(props: ToolRenderProps<TextChange>) {
  const content = inputText(props.args, "content");
  if (props.phase === "input") return <InputTail text={content ?? ""} />;
  return props.result?.data ? <TextChangeBody result={props.result} />
    : content !== undefined ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words type-code">{content}</pre> : null;
}
function TextEditBody(props: ToolRenderProps<TextChange>) {
  return props.result?.data ? <TextChangeBody result={props.result} /> : <EditPreview args={props.args} />;
}

/** 用户视图消费保存的正文和差异，不显示或重新生成模型用的锚点。 */
function TextReadBody({ result }: { result: ToolResult<TextRead> | null }) {
  const i18n = useI18n();
  const data = result?.data;
  return data ? <div className="flex flex-col gap-2">
    <div className="max-h-80 overflow-auto type-code">{data.rows.map(row =>
      <div key={row.line} className="flex gap-3">
        <span className="shrink-0 select-none text-muted-foreground">{row.line}</span>
        <pre className="min-w-0 whitespace-pre-wrap break-words">{row.content || " "}</pre>
      </div>)}</div>
    {data.noFinalNewline && <p className="type-caption">{i18n.formatMessage(textMessages.toolTextNoFinalNewline)}</p>}
    {data.nextOffset !== null && <p className="type-caption">{i18n.formatMessage(textMessages.toolTextMore, { line: data.nextOffset })}</p>}
  </div> : null;
}
function TextChangeBody({ result }: { result: ToolResult<TextChange> | null }) {
  const i18n = useI18n();
  const data = result?.data;
  return data ? data.diff
    ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words type-code">{data.diff}</pre>
    : <p className="type-caption">{data.changed ? i18n.formatMessage(toolsMessages.toolNoOutput) : i18n.formatMessage(textMessages.toolTextUnchanged)}</p>
    : null;
}

const readView = { headerRenderer: TextReadHeader, bodyRenderer: TextReadBody };
const writeView = { headerRenderer: TextWriteHeader, bodyRenderer: TextWriteBody };
const editView = { headerRenderer: TextEditHeader, bodyRenderer: TextEditBody };
export const textReadViews = {
  input: { headerRenderer: TextReadHeader }, execution: readView, result: readView,
} satisfies ToolRendererDefinition<TextRead>;
export const textWriteViews = {
  input: writeView, execution: writeView, result: writeView,
} satisfies ToolRendererDefinition<TextChange>;
export const textEditViews = {
  input: editView, execution: editView, result: editView,
} satisfies ToolRendererDefinition<TextChange>;
