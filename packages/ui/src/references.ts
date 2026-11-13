import { parseModelUrl, parseResourceUrl, parseSkillUrl } from "@asterism-app/sdk/contracts";

/** The scheme a reference destination uses; null for other destinations. */
export type ReferenceKind = "skill" | "resource" | "model";

export function referenceKind(href: string): ReferenceKind | null {
  if (parseSkillUrl(href)) return "skill";
  if (parseModelUrl(href)) return "model";
  return parseResourceUrl(href) ? "resource" : null;
}

/** Split at the first colon, keeping the separator and all following text in the supplement. */
export function splitReferenceLabel(label: string): { primary: string; supplement: string | null } {
  const separator = label.indexOf(":");
  return separator < 0 ? { primary: label, supplement: null }
    : { primary: label.slice(0, separator), supplement: label.slice(separator) };
}
