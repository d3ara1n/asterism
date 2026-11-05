import { parseResourceUrl, parseSkillUrl } from "@asterism-app/sdk/contracts";

/** What a reference destination addresses; null for destinations outside the skill and resource schemes. */
export type ReferenceKind = "skill" | "directory" | "file";

export function referenceKind(href: string): ReferenceKind | null {
  if (parseSkillUrl(href)) return "skill";
  const resource = parseResourceUrl(href);
  if (!resource) return null;
  // A resource root or a trailing slash addresses a container; other locations address an item.
  return !resource.location || resource.location.endsWith("/") ? "directory" : "file";
}
