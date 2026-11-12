import { parseResourceUrl, parseSkillUrl } from "@asterism-app/sdk/contracts";

/** The scheme a reference destination uses; null for destinations outside the skill and resource schemes. */
export type ReferenceKind = "skill" | "resource";

export function referenceKind(href: string): ReferenceKind | null {
  if (parseSkillUrl(href)) return "skill";
  return parseResourceUrl(href) ? "resource" : null;
}
