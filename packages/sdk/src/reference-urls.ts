/**
 * Reference URLs are plain strings that name something the model or the user can look up: `resource:` addresses a
 * location inside a session resource, `skill:` addresses a skill package through the skill catalog. A reference may
 * name something that does not exist; parsing checks only the format.
 */

/** `resource:<resourceId>/<location>`: the authority is the resource ID and the resource interprets the location. */
export interface ResourceUrl { readonly resourceId: string; readonly location: string }
/** `skill:<name>[/<path>]`: the skill name and an optional package-relative file; undefined means SKILL.md. */
export interface SkillUrl { readonly name: string; readonly path: string | undefined }

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const decodePath = (path: string) => path.split("/").map(decodeURIComponent).join("/");

export function resourceUrl(resourceId: string, location: string): string {
  return `resource:${encodeURIComponent(resourceId)}/${encodePath(location)}`;
}

export function parseResourceUrl(value: string): ResourceUrl | null {
  const match = /^resource:([^/?#]+)\/(.*)$/u.exec(value);
  if (!match) return null;
  try {
    const resourceId = decodeURIComponent(match[1]!);
    return resourceId ? { resourceId, location: decodePath(match[2]!) } : null;
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

/** The text form of a reference: a Markdown link whose label is display text and whose destination is the URL. */
export function referenceMarkdown(label: string, url: string): string {
  return `[${label}](${url})`;
}
