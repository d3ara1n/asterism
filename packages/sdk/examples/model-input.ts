import type { ContentRef, ModelItem, ModelInputPart } from "@asterism/sdk/contracts";
import type { ContentScope, ModelServices } from "@asterism/sdk/runtime";

/** 准备阶段已取得 content；文件不需要先成为对象或历史记录才能用于一次性补全。 */
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
  // @ts-expect-error 模型消息只携带内容引用，不接受字节本体。
  const bytes: ModelInputPart = { kind: "file", file: new Uint8Array(), mediaType: "image/png" };
  // @ts-expect-error 路径不构成内容身份或读取资格。
  const path: ModelInputPart = { kind: "file", file: "/tmp/image.png", mediaType: "image/png" };
  // @ts-expect-error 输入协议只有 parts，纯文字也用一个 text 部件。
  const legacy: ModelItem = { kind: "input", text: "Hello" };
  void bytes; void path; void legacy;
  return [valid];
}
