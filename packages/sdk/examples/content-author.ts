import { defineModule, definePlugin, implementAction, implementCreation, implementResource, type ObjectReader } from "@atelier/sdk/runtime";
import { CreateDocument, Document, DocumentContent, Imported, ReplaceDocument, files } from "./content-contract.ts";

/** 会话持有内容，插件只解释业务格式；示例不访问宿主源码或私有路径。 */
export default definePlugin({ namespace: files, version: "1", modules: [defineModule(() => ({
  resources: [implementResource(Document, DocumentContent, {
    records: [Imported],
    creation: implementCreation(CreateDocument, {
      async prepare(input, { content }) {
        // 格式检查可以读取有限范围，也可以通过 open 流式处理大文件。
        await content.read(input.file, { length: 512 });
        return { action: "accept" };
      },
      create(input, object) {
        object.commit(writer => {
          writer.set(DocumentContent, input);
          // 该例明确保留最初导入内容；仅保存当前值的资源可省去这个事件。
          writer.append(Imported, input);
        });
        return { title: input.name, data: {} };
      },
    }),
    actions: [implementAction(ReplaceDocument, {
      async execute(input, object) { object.commit(writer => { writer.set(DocumentContent, input); }); },
    })],
    project: (_data, object) => object.get(DocumentContent)!,
    inspect: async (_data, object) => object.get(DocumentContent),
  })],
}))] });

export function rejectReadOnlyStaging(object: ObjectReader) {
  // @ts-expect-error 读取门面没有内容暂存能力。
  void object.content.stage(new Uint8Array());
}
