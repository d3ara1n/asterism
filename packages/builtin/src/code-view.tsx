import { useEffect, useMemo, useState } from "react";
import { File, type FileOptions } from "@pierre/diffs/react";
import { resolveLanguage } from "@pierre/diffs";
import { codeViewOptions } from "./shared/code-view";

/**
 * Body providers deliver contiguous excerpts; public callbacks project line-number labels to the excerpts' absolute positions.
 * dimmed contains zero-based line indices within the excerpt to de-emphasize; line numbers and body text share data-line-index and are dimmed together through the library's unsafeCSS layer.
 * overflow defaults to the shared code view's wrapping behavior; search excerpts and similar content can opt into horizontal scrolling.
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

/** Resolved languages; remounting (such as switching back to static rendering after streaming) highlights immediately without first falling back to plain text. */
const resolvedLanguages = new Map<string, string>();

/** Markdown code without a filename uses the explicit language; Pierre resolves aliases and loads grammars itself. */
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
      // Unrecognized languages retain their original labels; the body remains readable and copyable as plain text.
      resolvedLanguages.set(requested, "text");
      if (active) setResolved(requested);
    });
    return () => { active = false; };
  }, [requested]);
  const lang = resolvedLanguages.get(requested) ?? "text";
  const file = useMemo(() => ({ name: "code", contents, lang }), [contents, lang]);
  return <File file={file} options={textOptions} className="pierre-code type-code" disableWorkerPool />;
}
