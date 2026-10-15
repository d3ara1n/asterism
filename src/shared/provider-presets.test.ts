import { describe, expect, it } from "vitest";
import { defineProviderPresets, providerPresetDraft, providerPresets } from "./provider-presets.ts";

describe("提供商连接预设", () => {
  // 配置契约：预设只提供连接；编辑或移除草稿兼容项不能污染以后创建的连接。
  it("Kimi 带入端点字段设置，每份草稿独立且不携带目录元数据", () => {
    const preset = providerPresets.find(item => item.id === "kimi")!;
    const draft = providerPresetDraft(preset);
    expect(draft).toEqual({
      id: "kimi", name: "Kimi", protocol: "openai-responses",
      baseUrl: "https://api.moonshot.ai/v1", auth: "api_key",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }],
    });
    draft.compatibility[0]!.id = "systemMessageInMessages";
    draft.compatibility.push({ id: "toolFilesAsUserMessage" });
    draft.baseUrl = "https://example.test/v1";
    expect(providerPresetDraft(preset).compatibility).toEqual([{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }]);
    expect(preset.connection.baseUrl).toBe("https://api.moonshot.ai/v1");
  });

  // 重复添加同一产品必须生成新连接身份，不能覆盖已有密钥或连接配置。
  it("连接 ID 避开已有身份，地区与计费产品仍可独立声明", () => {
    const preset = providerPresets[0]!;
    const occupied = ["openai", "openai-2", "openai-4"];
    expect(providerPresetDraft(preset, occupied).id).toBe("openai-3");
    const subscription = { ...preset, id: "example-china-coding", name: "Example", region: "China", plan: "Coding Plan", billing: "subscription" as const };
    expect(defineProviderPresets([preset, subscription])).toHaveLength(2);
    expect(providerPresetDraft(subscription, occupied).id).toBe("example-china-coding");
    expect(occupied).toEqual(["openai", "openai-2", "openai-4"]);
  });

  // 目录以 id 选择预设；重复身份会让不同产品无法被可靠区分，声明时必须报错。
  it("目录拒绝重复预设身份", () => {
    expect(() => defineProviderPresets([providerPresets[0]!, providerPresets[0]!])).toThrow("Duplicate provider preset");
  });
});
