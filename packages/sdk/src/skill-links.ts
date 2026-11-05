/** A skill link is a URL with scheme `skill`, the skill name as its first segment, and an optional package-relative file path. */
export interface SkillLink {
  /** Skill name resolved through the skill catalog. */
  readonly name: string;
  /** Package-relative file path; undefined means SKILL.md. */
  readonly path: string | undefined;
}

export function skillLink(name: string, path?: string): string {
  const encoded = encodeURIComponent(name);
  return path ? `skill:${encoded}/${path.split("/").map(encodeURIComponent).join("/")}` : `skill:${encoded}`;
}

export function parseSkillLink(value: string): SkillLink | null {
  const match = /^skill:([^/?#]+)(?:\/([^?#]+))?$/u.exec(value);
  if (!match) return null;
  try {
    const name = decodeURIComponent(match[1]!);
    const path = match[2]?.split("/").map(decodeURIComponent).join("/");
    return name ? { name, path } : null;
  } catch { return null; }
}
