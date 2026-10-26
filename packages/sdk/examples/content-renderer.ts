import { creationEntry, type RendererObjectContext } from "@asterism/sdk/renderer";
import { CreateDocument, ReplaceDocument } from "./content-contract.ts";

/** 该入口受理拖入文件（有无本机路径均可）与工作台剪贴板图片。 */
export const importDocument = creationEntry(CreateDocument, {
  id: "example.content/import", label: "Import document",
  triggers: { drop: {
    accepts: { files: {} },
    async toInput(item, content) {
      if (item.kind !== "file" || item.directory) return null;
      return { file: await content.stage(item.file), name: item.name };
    },
  } },
});

/** 草稿在命令成功后由宿主关闭；失败保留以便重试，放弃时调用 close。 */
export function replacementInput(object: RendererObjectContext) {
  const draft = object.input(ReplaceDocument);
  return {
    async submit(file: File) {
      const ref = await draft.stage(file);
      return object.invoke(ReplaceDocument, { file: ref, name: file.name }, { content: draft });
    },
    cancel: () => draft.close(),
  };
}
