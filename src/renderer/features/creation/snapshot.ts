import type { DropItem } from "@asterism-app/sdk/renderer";
import type { DragKind } from "./routing";

/** Only the type list can be read during hover; files take priority, followed by URLs, then plain text. */
export function dragKinds(transfer: DataTransfer): DragKind[] {
  const types = [...transfer.types];
  if (types.includes("Files")) return ["file"];
  return [...(types.includes("text/uri-list") ? ["url" as const] : []), ...(types.includes("text/plain") ? ["text" as const] : [])];
}

/** Read the snapshot synchronously on drop; DataTransfer expires when the event ends. The desktop bridge resolves file paths. */
export function snapshotDrop(transfer: DataTransfer): DropItem[] {
  const items: DropItem[] = [];
  const entries = [...transfer.items].filter(item => item.kind === "file");
  if (entries.length) {
    for (const item of entries) {
      const file = item.getAsFile();
      if (!file) continue;
      const path = window.host.pathForFile(file) || undefined;
      const directory = !!path && item.webkitGetAsEntry()?.isDirectory === true;
      items.push({ kind: "file", file, name: file.name, mime: directory ? "" : file.type, directory, ...(path ? { path } : {}) });
    }
    return items;
  }
  const urls = transfer.getData("text/uri-list").split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
  if (urls.length) return urls.map(url => ({ kind: "url", url }));
  const text = transfer.getData("text/plain");
  return text ? [{ kind: "text", text }] : [];
}
