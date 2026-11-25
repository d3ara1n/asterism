import { useEffect, useMemo, useState } from "react";
import type { DiffProps } from "@asterism-app/sdk/renderer";
import { File, FileDiff, type FileDiffOptions, type FileOptions } from "@pierre/diffs/react";
import { parsePatchFiles, preloadHighlighter, type BaseCodeOptions, type FileDiffMetadata, type SupportedLanguages } from "@pierre/diffs";
import { codeViewThemeOptions } from "./code-theme";

/** Shared Pierre presentation; the host stylesheet supplies `.pierre-code` fonts, sizes, and compact spacing. */
export const codeViewOptions = {
  ...codeViewThemeOptions, themeType: "system",
  disableFileHeader: true, overflow: "wrap",
} satisfies BaseCodeOptions;

/** Common grammars registered at startup; the library asynchronously adds highlighting for other languages on first use. */
const preloadedLanguages: SupportedLanguages[] = [
  "text", "diff", "typescript", "tsx", "javascript", "jsx", "json", "markdown", "css", "html",
  "python", "shellscript", "yaml", "toml", "rust", "go", "java", "c", "cpp", "sql", "xml",
];

let preparing: Promise<void> | null = null;
/**
 * Registers themes and common grammars once, letting code and diff views render highlighted content synchronously on their first render.
 * Renderer modules can return it from `prepare`; views rendered before preparation completes highlight asynchronously.
 */
export function prepareCodeView(): Promise<void> {
  preparing ??= preloadHighlighter({
    themes: [codeViewOptions.theme.light, codeViewOptions.theme.dark],
    langs: preloadedLanguages, preferredHighlighter: codeViewOptions.preferredHighlighter,
  }).catch(error => { preparing = null; throw error; });
  return preparing;
}

/**
 * Contiguous excerpt rows; line-number labels show each row's absolute position.
 * dimmed contains zero-based line indices within the excerpt to de-emphasize; line numbers and body text share data-line-index and are dimmed together through the library's unsafeCSS layer.
 * filename selects the grammar by extension. overflow defaults to wrapping.
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

/** Resolved languages; remounting (such as switching back to static rendering after streaming) highlights immediately without first falling back to plain text. */
const resolvedLanguages = new Map<string, string>();

/** Whole text in an explicit language, such as fenced Markdown code or script source; Pierre resolves aliases and loads grammars itself. */
export function CodeText({ contents, language, lineNumbers = false, overflow = "scroll", themeType = "system" }: {
  contents: string; language: string; lineNumbers?: boolean; overflow?: "wrap" | "scroll"; themeType?: "system" | "light" | "dark";
}) {
  const requested = language.toLowerCase();
  const [, setResolved] = useState<string>();
  useEffect(() => {
    let active = true;
    if (!requested || requested === "text" || resolvedLanguages.has(requested)) return;
    // A resolved grammar is not yet attached to Pierre's shared highlighter. Prepare it
    // before committing the language so a static capture cannot observe the plain-text fallback.
    void preloadHighlighter({ themes: [codeViewOptions.theme.light, codeViewOptions.theme.dark],
      langs: [requested], preferredHighlighter: codeViewOptions.preferredHighlighter }).then(() => {
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
  const [rendered, setRendered] = useState<typeof file | null>(null);
  const options = useMemo<FileOptions<undefined, undefined>>(() => ({
    ...codeViewOptions, disableLineNumbers: !lineNumbers, overflow, themeType,
    onPostRender(_node, _instance, phase) { if (phase !== "unmount") setRendered(file); },
  }), [file, lineNumbers, overflow, themeType]);
  return <div data-render-pending={rendered !== file || (requested && requested !== "text" && !resolvedLanguages.has(requested)) ? "" : undefined}>
    <File file={file} options={options} className="pierre-code type-code" disableWorkerPool />
  </div>;
}

const diffViewOptions = {
  ...codeViewOptions, diffStyle: "unified", diffIndicators: "bars",
  hunkSeparators: "simple", expandUnchanged: false,
} as const satisfies FileDiffOptions<undefined, undefined>;

/** Only a single file with hunks can use the structured view. Keep header-only patches readable in the text view. */
function parseFileDiff(patch: string): FileDiffMetadata | null {
  try {
    const files = parsePatchFiles(patch, undefined, true).flatMap(entry => entry.files);
    return files.length === 1 && files[0]?.hunks.length ? files[0] : null;
  } catch {
    return null;
  }
}

export function Diff({ diff, wrap = true, highlightChanges = "none", syntax = "auto", lineNumbers = true }: DiffProps) {
  const parsed = useMemo(() => parseFileDiff(diff), [diff]);
  const fileDiff = useMemo(() => parsed && syntax === "plain" ? { ...parsed, lang: "text" } : parsed, [parsed, syntax]);
  const overflow = wrap ? "wrap" : "scroll";
  const options = useMemo<FileDiffOptions<undefined, undefined>>(() => ({
    ...diffViewOptions, overflow, lineDiffType: highlightChanges === "word" ? "word-alt" : "none", disableLineNumbers: !lineNumbers,
  }), [overflow, highlightChanges, lineNumbers]);
  if (!fileDiff) return <CodeText contents={diff} language="diff" overflow={overflow} />;
  return <FileDiff fileDiff={fileDiff} options={options} className="pierre-code type-code" disableWorkerPool />;
}
