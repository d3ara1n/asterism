import type { CreationEntry, DropAccepts, DropItem } from "@asterism-app/sdk/renderer";

/**
 * Pure drag-and-drop arbitration logic: declarative matching, candidate sets, and routing memory keys.
 * Memory keys are normalized and versioned by the host, using the first available discriminator in fixed priority order (extension > MIME > URL scheme > category),
 * independently of candidate assembly order.
 */
export const routeKeyVersion = 1;

/** Only coarse categories are readable during hover; the complete snapshot is available after drop. */
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

/** Hover matching: checks categories only and allows broadly; precise filtering occurs after drop. */
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

/** Normalized routing memory key; use the most specific discriminator for a given payload. */
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

/** A remembered choice matches only while it remains a current candidate; otherwise return null and require the caller to clean it up. */
export function rememberedEntry(candidates: readonly CreationEntry[], remembered: string | null): CreationEntry | null {
  return remembered ? candidates.find(entry => entry.id === remembered) ?? null : null;
}
