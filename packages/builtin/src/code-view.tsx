import { useEffect, useMemo, useState } from "react";
import { File, type FileOptions } from "@pierre/diffs/react";
import { resolveLanguage } from "@pierre/diffs";
import { codeViewOptions } from "./shared/code-view";

/** 正文提供方交付连续片段；通过公开回调把行号标签投影到片段的绝对位置。 */
export function CodeRows({ rows, filename }: { rows: readonly { line: number; content: string }[]; filename?: string }) {
  const firstLine = rows[0]?.line ?? 1;
  const contents = rows.map(row => row.content).join("\n");
  const file = useMemo(() => ({ name: filename ?? "preview.txt", contents }), [filename, contents]);
  const options = useMemo<FileOptions<undefined, undefined>>(() => ({
    ...codeViewOptions,
    onPostRender(node, _instance, phase) {
      if (phase === "unmount") return;
      for (const gutter of node.shadowRoot?.querySelectorAll<HTMLElement>("[data-gutter] [data-line-index][data-column-number]") ?? []) {
        const label = gutter.querySelector("[data-line-number-content]");
        if (label) label.textContent = String(firstLine + Number(gutter.dataset.lineIndex));
      }
    },
  }), [firstLine]);
  return rows.length ? <File file={file} options={options} className="pierre-code type-code" disableWorkerPool /> : null;
}

const textOptions = { ...codeViewOptions, disableLineNumbers: true, overflow: "scroll" } satisfies FileOptions<undefined, undefined>;

/** 无文件名的 Markdown 代码使用显式语言；Pierre 自行解析别名和加载语法。 */
export function CodeText({ contents, language }: { contents: string; language: string }) {
  const requested = language.toLowerCase();
  const [resolved, setResolved] = useState({ requested: "", language: "text" });
  useEffect(() => {
    let active = true;
    if (!requested || requested === "text") return;
    void resolveLanguage(requested).then(() => {
      if (active) setResolved({ requested, language: requested });
    }, () => {
      // 未识别的语言保留原标签，正文仍可按纯文本阅读和复制。
      if (active) setResolved({ requested, language: "text" });
    });
    return () => { active = false; };
  }, [requested]);
  const lang = resolved.requested === requested ? resolved.language : "text";
  const file = useMemo(() => ({ name: "code", contents, lang }), [contents, lang]);
  return <File file={file} options={textOptions} className="pierre-code type-code" disableWorkerPool />;
}
