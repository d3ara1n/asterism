import { referenceDragType } from "@asterism-app/sdk/renderer";

/** Only transfer types are available during hover. Internal reference drags belong to the editor. */
export function isFileDrag(types: readonly string[]): boolean {
  return types.includes("Files") && !types.includes(referenceDragType);
}

/** Resolve a complete batch synchronously on drop. Never substitute filenames for missing paths. */
export function droppedPathText(files: readonly File[], pathForFile: (file: File) => string | null): string | null {
  const paths: string[] = [];
  for (const file of files) {
    const path = pathForFile(file);
    if (!path) return null;
    paths.push(path);
  }
  return paths.length ? paths.join("\n") : null;
}
