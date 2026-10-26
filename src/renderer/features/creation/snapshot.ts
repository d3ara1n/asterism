import type { DropItem } from "@asterism/sdk/renderer";
import type { DragKind } from "./routing";

/** 悬停阶段只能读取类型列表；文件优先，其次 URL，再次纯文本。 */
export function dragKinds(transfer: DataTransfer): DragKind[] {
  const types = [...transfer.types];
  if (types.includes("Files")) return ["file"];
  return [...(types.includes("text/uri-list") ? ["url" as const] : []), ...(types.includes("text/plain") ? ["text" as const] : [])];
}

/** 放下时同步读出快照；DataTransfer 在事件结束后失效。文件路径由桌面桥解析。 */
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
