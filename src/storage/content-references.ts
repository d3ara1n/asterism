import { contentRefSchema, type ContentRef, type Json } from "@asterism-app/sdk/contracts";

/** Recognize complete SDK reference values only; continue recursively scanning ordinary JSON such as schema field definitions. */
export function contentReferences(value: Json): ContentRef[] {
  const refs = new Map<string, ContentRef>();
  const pending: Json[] = [value];
  while (pending.length) {
    const item = pending.pop()!;
    if (item === null || typeof item !== "object") continue;
    if (Array.isArray(item)) { for (const value of item) pending.push(value); continue; }
    if (Object.hasOwn(item, "$asterism.content")) {
      const parsed = contentRefSchema.safeParse(item);
      if (parsed.success) {
        refs.set(parsed.data["$asterism.content"], parsed.data);
        continue;
      }
    }
    for (const value of Object.values(item)) pending.push(value);
  }
  return [...refs.values()];
}
