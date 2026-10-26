import { describe, expect, it } from "vitest";
import { contentReferences } from "./content-store.ts";
import { schemaOf } from "../tools/definition.ts";
import { TerminalSee } from "../../packages/builtin/src/terminal/contract.ts";

describe("持久 JSON 中的内容引用", () => {
  // resource_inspect 返回的截图结果 schema 含同名属性定义；它不是实际文件引用。
  it("终端工具目录中的 ContentRef 字段定义可以作为普通 JSON 保存", () => {
    expect(contentReferences({ tools: [{ result: schemaOf(TerminalSee.schema) }] })).toEqual([]);
  });

  // 保留值按完整形状识别；同名普通字段仍可包含真正引用，扫描不能提前停止。
  it("只收集精确引用，穿过普通同名字段并去重", () => {
    const ref = { "$asterism.content": "c8ded95c-2061-4bc3-8744-3efb7aa1eb69" };
    expect(contentReferences({
      schema: { "$asterism.content": { nested: [ref] } },
      text: JSON.stringify(ref),
      extra: { ...ref, description: "ordinary object" },
      invalid: { "$asterism.content": "not-a-uuid" },
      files: [ref],
    })).toEqual([ref]);
  });
});
