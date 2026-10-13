import { useMemo } from "react";
import { File, type FileOptions } from "@pierre/diffs/react";
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
