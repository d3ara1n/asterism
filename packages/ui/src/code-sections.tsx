import { useMemo } from "react";
import { File, type FileOptions } from "@pierre/diffs/react";
import { codeViewOptions } from "./code-view";
import { cn } from "./utils";

export interface CodeSectionRow { line: number; content: string; match?: boolean }
/** Rows separated by a gap are distinct excerpts of the same text; a shared line number is never invented for the gap. */
export interface CodeSection { rows: readonly CodeSectionRow[] }

/** Adjacent rows continue one excerpt; a missing line number starts a new one. */
export function mergeCodeSections(sections: readonly CodeSection[]): CodeSection[] {
  const merged: CodeSectionRow[][] = [];
  for (const section of sections) {
    if (!section.rows.length) continue;
    const last = merged.at(-1);
    if (last && last.at(-1)!.line + 1 === section.rows[0].line) last.push(...section.rows);
    else merged.push([...section.rows]);
  }
  return merged.map(rows => ({ rows }));
}

function SectionRows({ rows, filename, overflow }: {
  rows: readonly CodeSectionRow[]; filename?: string; overflow: "wrap" | "scroll";
}) {
  const contents = useMemo(() => rows.map(row => row.content).join("\n"), [rows]);
  const firstLine = rows[0].line;
  // Context rows recede so matching rows read at full strength; an all-match excerpt needs no treatment.
  const dimKey = useMemo(() => rows.flatMap((row, index) => row.match ? [] : [index]).join(","), [rows]);
  const options = useMemo<FileOptions<undefined, undefined>>(() => ({
    ...codeViewOptions, overflow,
    unsafeCSS: dimKey
      ? dimKey.split(",").map(index => `[data-line-index="${index}"] { opacity: 0.5; }`).join(" ")
      : undefined,
    onPostRender(node, _instance, phase) {
      if (phase === "unmount") return;
      for (const gutter of node.shadowRoot?.querySelectorAll<HTMLElement>("[data-gutter] [data-line-index][data-column-number]") ?? []) {
        const label = gutter.querySelector("[data-line-number-content]");
        if (label) label.textContent = String(firstLine + Number(gutter.dataset.lineIndex));
      }
    },
  }), [firstLine, dimKey, overflow]);
  const file = useMemo(() => ({ name: filename ?? "preview.txt", contents }), [filename, contents]);
  return <File file={file} options={options} className="pierre-code type-code" disableWorkerPool />;
}

/**
 * One reading region for non-contiguous excerpts of the same text: each excerpt keeps its own absolute line numbers,
 * a trimmed hairline marks the gap instead of a fabricated line, and the whole stack shares one frame.
 */
export function CodeSections({ sections, filename, overflow = "wrap", className }: {
  sections: readonly CodeSection[]; filename?: string; overflow?: "wrap" | "scroll"; className?: string;
}) {
  const merged = useMemo(() => mergeCodeSections(sections), [sections]);
  if (!merged.length) return null;
  return <div className={cn("flex min-w-0 flex-col", className)}>
    {merged.map((section, index) => <div key={section.rows[0].line} className="min-w-0">
      {index > 0 && <div aria-hidden="true" className="my-1 flex items-center gap-2 text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="type-caption leading-none tracking-widest">⋯</span>
        <span className="h-px flex-1 bg-border" />
      </div>}
      <SectionRows rows={section.rows} filename={filename} overflow={overflow} />
    </div>)}
  </div>;
}
