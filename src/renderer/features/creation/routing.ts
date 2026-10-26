import type { CreationEntry, DropAccepts, DropItem } from "@asterism/sdk/renderer";

/**
 * 拖放仲裁的纯逻辑：声明式匹配、候选集与路由记忆键。
 * 记忆键由宿主规范化并带版本，按固定优先级（扩展名 > MIME > URL scheme > 类别）取首个可用判别项，
 * 不由候选装配顺序决定。
 */
export const routeKeyVersion = 1;

/** 悬停阶段只能读到粗粒度类别；放下后才有完整快照。 */
export type DragKind = "file" | "url" | "text";

export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot).toLowerCase() : null;
}
function mimeMatches(pattern: string, mime: string): boolean {
  const p = pattern.toLowerCase(), m = mime.toLowerCase();
  return p.endsWith("/*") ? m.startsWith(p.slice(0, -1)) : p === m;
}
function schemeOf(url: string): string | null {
  try { return new URL(url).protocol.replace(/:$/u, "").toLowerCase(); } catch { return null; }
}

/** 悬停判断：只看类别，宽松放行；精确筛选在放下后执行。 */
export function acceptsKind(accepts: DropAccepts, kind: DragKind): boolean {
  return kind === "file" ? !!accepts.files : kind === "url" ? !!accepts.urls : !!accepts.text;
}

export function acceptsItem(accepts: DropAccepts, item: DropItem): boolean {
  switch (item.kind) {
    case "file": {
      const files = accepts.files;
      if (!files) return false;
      if (!item.path && (files.requiresPath || files.directories)) return false;
      if (item.directory) return files.directories === true;
      const filtered = !!files.extensions?.length || !!files.mime?.length;
      if (!filtered) return files.directories !== true;
      const ext = extensionOf(item.name);
      return !!(ext && files.extensions?.some(e => e.toLowerCase() === ext))
        || !!(item.mime && files.mime?.some(pattern => mimeMatches(pattern, item.mime)));
    }
    case "url": {
      const urls = accepts.urls;
      if (!urls) return false;
      const scheme = schemeOf(item.url);
      return !urls.schemes?.length || (!!scheme && urls.schemes.some(s => s.toLowerCase() === scheme));
    }
    case "text": return accepts.text === true;
  }
}

export function dropCandidates(entries: readonly CreationEntry[], item: DropItem): CreationEntry[] {
  return entries.filter(entry => entry.triggers.drop && acceptsItem(entry.triggers.drop.accepts, item));
}
export function canDropKind(entries: readonly CreationEntry[], kind: DragKind): boolean {
  return entries.some(entry => entry.triggers.drop && acceptsKind(entry.triggers.drop.accepts, kind));
}

/** 规范化的路由记忆键；同一载荷取最具体的判别项。 */
export function routeKey(item: DropItem): string {
  const prefix = `creation-route/v${routeKeyVersion}/drop`;
  switch (item.kind) {
    case "file": {
      if (item.directory) return `${prefix}:file/directory`;
      const origin = item.path ? "file" : "bytes";
      const ext = extensionOf(item.name);
      if (ext) return `${prefix}:${origin}/ext:${ext}`;
      if (item.mime) return `${prefix}:${origin}/mime:${item.mime.toLowerCase()}`;
      return `${prefix}:${origin}/other`;
    }
    case "url": return `${prefix}:url/scheme:${schemeOf(item.url) ?? "unknown"}`;
    case "text": return `${prefix}:text`;
  }
}

/** 记忆只在仍属当前候选时命中；否则返回 null 并要求调用方清理。 */
export function rememberedEntry(candidates: readonly CreationEntry[], remembered: string | null): CreationEntry | null {
  return remembered ? candidates.find(entry => entry.id === remembered) ?? null : null;
}
