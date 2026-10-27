import type { ContentRef, ModelItem, ModelInputPart } from "@asterism-app/sdk/contracts";
import type { ContentScope, ModelServices } from "@asterism-app/sdk/runtime";

export function inputTypeExamples(ref: ContentRef): ModelInputPart[] {
  const valid: ModelInputPart = { kind: "file", file: ref, mediaType: "image/png" };
  // @ts-expect-error Model messages carry only content references, not the bytes themselves.
  const bytes: ModelInputPart = { kind: "file", file: new Uint8Array(), mediaType: "image/png" };
  // @ts-expect-error A path provides neither content identity nor read eligibility.
  const path: ModelInputPart = { kind: "file", file: "/tmp/image.png", mediaType: "image/png" };
  // @ts-expect-error The input protocol has only parts; plain text also uses a single text part.
  const legacy: ModelItem = { kind: "input", text: "Hello" };
  void bytes; void path; void legacy;
  return [valid];
}
