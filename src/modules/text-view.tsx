import type { ToolResult } from "../shared/tool-result";
import type { TextRead, TextChange } from "../tools/text-contract";
import { t } from "../renderer/shared/i18n";

/** 用户视图消费保存的正文和差异，不显示或重新生成模型用的锚点。 */
export function TextReadBody({ result }: { result: ToolResult<TextRead> | null }) {
  const data = result?.data;
  return data ? <div className="flex flex-col gap-2">
    <div className="max-h-80 overflow-auto type-code">{data.rows.map(row =>
      <div key={row.line} className="flex gap-3">
        <span className="shrink-0 select-none text-muted-foreground">{row.line}</span>
        <pre className="min-w-0 whitespace-pre-wrap break-words">{row.content || " "}</pre>
      </div>)}</div>
    {data.noFinalNewline && <p className="type-caption">{t.toolTextNoFinalNewline}</p>}
    {data.nextOffset !== null && <p className="type-caption">{t.toolTextMore(data.nextOffset)}</p>}
  </div> : null;
}
export function TextChangeBody({ result }: { result: ToolResult<TextChange> | null }) {
  const data = result?.data;
  return data ? data.diff
    ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words type-code">{data.diff}</pre>
    : <p className="type-caption">{data.changed ? t.toolNoOutput : t.toolTextUnchanged}</p>
    : null;
}
