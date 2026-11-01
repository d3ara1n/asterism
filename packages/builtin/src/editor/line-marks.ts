import type { Change } from "diff";

export interface LineMark {
  line: number;
  change?: "added" | "modified";
  removed?: "before" | "after";
}

/** Translate a line diff into marks on the current document, including deletion boundaries without old text. */
export function marksFromChanges(changes: Change[], lineCount: number): LineMark[] {
  const marks = new Map<number, LineMark>();
  let line = 1;
  const removal = () => {
    const target = Math.min(line, lineCount);
    marks.set(target, { ...marks.get(target), line: target, removed: line > lineCount ? "after" : "before" });
  };
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index]!;
    if (change.removed) {
      const added = changes[index + 1]?.added ? changes[++index]! : null;
      for (let offset = 0; offset < (added?.count ?? 0); offset++, line++) {
        marks.set(line, { line, change: offset < change.count ? "modified" : "added" });
      }
      if (change.count > (added?.count ?? 0)) removal();
    } else if (change.added) {
      for (let offset = 0; offset < change.count; offset++, line++) marks.set(line, { ...marks.get(line), line, change: "added" });
    } else line += change.count;
  }
  return [...marks.values()].sort((a, b) => a.line - b.line);
}
