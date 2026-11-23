import { usageRelations, usageSubjectKinds, type UsageSubject } from "@asterism-app/sdk/contracts";

/** The skill catalog block as request context, measured in Unicode code points like request diagnostics. */
export function skillCatalogUsage(block: { id: string; text: string } | null): UsageSubject[] {
  return block ? [{ kind: usageSubjectKinds.skillCatalog, id: block.id, relation: usageRelations.context, quantity: [...block.text].length }] : [];
}
