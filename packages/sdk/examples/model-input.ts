import type { ContentRef, ModelItem, ModelInputPart } from "@asterism/sdk/contracts";
import type { ContentScope, ModelServices } from "@asterism/sdk/runtime";

/** content is already available during preparation; files need not become objects or history records before use in a one-off completion. */
export async function describeFile(models: ModelServices, content: ContentScope, bytes: Uint8Array, signal: AbortSignal) {
  const file = await content.stage(bytes);
  const messages: ModelItem[] = [{ kind: "input", parts: [
    { kind: "text", text: "Describe the image." },
    { kind: "file", file, mediaType: "image/png", filename: "screenshot.png" },
  ] }];
  const request = { target: { role: "utility" }, system: { blocks: [] }, messages, signal };
  await models.validate(request, { content });
  for await (const event of models.stream(request, { content })) {
    if (event.type === "part.delta") void event.delta;
  }
}

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
