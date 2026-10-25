import { useEffect, useMemo, useState } from "react";
import { File, type FileOptions } from "@pierre/diffs/react";
import { resolveLanguage } from "@pierre/diffs";
import { codeViewOptions } from "./shared/code-view";

/**
 * 正文提供方交付连续片段；通过公开回调把行号标签投影到片段的绝对位置。
 * dimmed 为片段内需要弱化的行序号（从 0 起）；行号与正文共用 data-line-index，经库的 unsafeCSS 层一并弱化。
 * overflow 默认沿用公共代码视图的换行；搜索片段等可选横向滚动。
 */
export function CodeRows({ rows, filename, dimmed, overflow }: {
  rows: readonly { line: number; content: string }[]; filename?: string; dimmed?: readonly number[]; overflow?: "wrap" | "scroll";
}) {
  const firstLine = rows[0]?.line ?? 1;
  const contents = rows.map(row => row.content).join("\n");
  const file = useMemo(() => ({ name: filename ?? "preview.txt", contents }), [filename, contents]);
  const dimmedKey = dimmed?.join(",") ?? "";
  const options = useMemo<FileOptions<undefined, undefined>>(() => ({
    ...codeViewOptions, ...(overflow ? { overflow } : {}),
    unsafeCSS: dimmedKey ? `${dimmedKey.split(",").map(index => `[data-line-index="${index}"]`).join(",")} { opacity: 0.5; }` : undefined,
    onPostRender(node, _instance, phase) {
      if (phase === "unmount") return;
      for (const gutter of node.shadowRoot?.querySelectorAll<HTMLElement>("[data-gutter] [data-line-index][data-column-number]") ?? []) {
        const label = gutter.querySelector("[data-line-number-content]");
        if (label) label.textContent = String(firstLine + Number(gutter.dataset.lineIndex));
      }
    },
  }), [firstLine, dimmedKey, overflow]);
  return rows.length ? <File file={file} options={options} className="pierre-code type-code" disableWorkerPool /> : null;
}

const textOptions = { ...codeViewOptions, disableLineNumbers: true, overflow: "scroll" } satisfies FileOptions<undefined, undefined>;

/** 已解析的语言；重新挂载（如流式结束换回静态渲染）时直接着色，不先回退纯文本。 */
const resolvedLanguages = new Map<string, string>();

/** 无文件名的 Markdown 代码使用显式语言；Pierre 自行解析别名和加载语法。 */
export function CodeText({ contents, language }: { contents: string; language: string }) {
  const requested = language.toLowerCase();
  const [, setResolved] = useState<string>();
  useEffect(() => {
    let active = true;
    if (!requested || requested === "text" || resolvedLanguages.has(requested)) return;
    void resolveLanguage(requested).then(() => {
      resolvedLanguages.set(requested, requested);
      if (active) setResolved(requested);
    }, () => {
      // 未识别的语言保留原标签，正文仍可按纯文本阅读和复制。
      resolvedLanguages.set(requested, "text");
      if (active) setResolved(requested);
    });
    return () => { active = false; };
  }, [requested]);
  const lang = resolvedLanguages.get(requested) ?? "text";
  const file = useMemo(() => ({ name: "code", contents, lang }), [contents, lang]);
  return <File file={file} options={textOptions} className="pierre-code type-code" disableWorkerPool />;
}
