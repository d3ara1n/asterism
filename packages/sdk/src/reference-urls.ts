import { parseModelExpression, type ModelExpression } from "./model-selection.ts";

/**
 * Reference URLs are plain strings that name something the model or the user can look up: `resource:` addresses a
 * location inside a session resource, `skill:` addresses a skill package through the skill catalog, and `model:`
 * addresses a configured model by its provider/model expression. A reference may
 * name something that does not exist; parsing checks only the format.
 */

/** `resource:<resourceId>/<location>[#<fragment>]`: the resource interprets the location and optional navigation fragment. */
export interface ResourceUrl { readonly resourceId: string; readonly location: string; readonly fragment?: string }
/** `skill:<name>[/<path>]`: the skill name and an optional package-relative file; undefined means SKILL.md. */
export interface SkillUrl { readonly name: string; readonly path: string | undefined }

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const decodePath = (path: string) => path.split("/").map(decodeURIComponent).join("/");

export function resourceUrl(resourceId: string, location: string, fragment?: string): string {
  const suffix = fragment === undefined ? "" : `#${encodeURIComponent(fragment)}`;
  // Parentheses are URI-safe but delimit the Markdown destination used by references.
  return `resource:${encodeURIComponent(resourceId)}/${encodePath(location)}${suffix}`.replaceAll("(", "%28").replaceAll(")", "%29");
}

export function parseResourceUrl(value: string): ResourceUrl | null {
  const match = /^resource:([^/?#]+)\/(.*)$/u.exec(value);
  if (!match) return null;
  try {
    const resourceId = decodeURIComponent(match[1]!);
    if (!resourceId) return null;
    const address = match[2]!;
    const hash = address.indexOf("#");
    if (hash < 0) return { resourceId, location: decodePath(address) };
    const location = decodePath(address.slice(0, hash));
    // A malformed navigation hint does not invalidate the resource location.
    try { return { resourceId, location, fragment: decodeURIComponent(address.slice(hash + 1)) }; }
    catch { return { resourceId, location }; }
  } catch { return null; }
}

export function skillUrl(name: string, path?: string): string {
  const encoded = encodeURIComponent(name);
  return path ? `skill:${encoded}/${encodePath(path)}` : `skill:${encoded}`;
}

export function parseSkillUrl(value: string): SkillUrl | null {
  const match = /^skill:([^/?#]+)(?:\/([^?#]+))?$/u.exec(value);
  if (!match) return null;
  try {
    const name = decodeURIComponent(match[1]!);
    return name ? { name, path: match[2] === undefined ? undefined : decodePath(match[2]) } : null;
  } catch { return null; }
}

/** `model:<provider>/<model>` is a language model reference. Model IDs may contain further slashes. */
export function modelUrl(expression: string): string {
  return `model:${encodePath(expression)}`;
}

export function parseModelUrl(value: string): ModelExpression | null {
  const match = /^model:([^?#\s]+)$/u.exec(value);
  if (!match) return null;
  try { return parseModelExpression(decodePath(match[1]!)); } catch { return null; }
}

/** The text form of a reference: a Markdown link whose label is display text and whose destination is the URL. */
export function referenceMarkdown(label: string, url: string): string {
  return `[${label.replace(/[\r\n]+/gu, " ").replace(/[\\[\]]/gu, "\\$&")}](${url})`;
}

/** Markdown links whose destination uses a reference scheme; the label is unescaped. Destinations are not parsed further. */
export function* referenceLinks(text: string): Generator<{ index: number; length: number; label: string; url: string }> {
  for (const match of text.matchAll(/\[((?:\\[^\r\n]|[^\\\]\r\n])*)\]\(((?:resource|skill|model):[^()\s]+)\)/gu))
    yield { index: match.index, length: match[0].length, label: match[1]!.replace(/\\([\\[\]])/gu, "$1"), url: match[2]! };
}
