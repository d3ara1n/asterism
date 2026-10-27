import type { Json } from "@asterism-app/sdk/contracts";
import { inputText } from "./tool-preview.ts";

export function messageTarget(target: Json): string | undefined {
  const title = inputText(target, "title");
  if (!title) return undefined;
  const id = target && typeof target === "object" && !Array.isArray(target) ? target.id : null;
  return typeof id === "number" && id > 0 ? `${title} [${id}]` : title;
}
