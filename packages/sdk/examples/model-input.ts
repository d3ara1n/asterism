import type { ModelItem } from "@asterism/sdk/contracts";
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
