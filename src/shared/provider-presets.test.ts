import { describe, expect, it } from "vitest";
import { defineProviderPresets, providerPresetDraft } from "./provider-presets.ts";
import { providerPresets } from "../../packages/builtin/src/providers/presets.ts";
import { canEditProviderField, providerInputSchema } from "./configuration.ts";

describe("提供商连接预设", () => {
  // 预设组合配置和编辑规则；每份草稿须独立，且不携带持久预设身份。
  it("Kimi 带入固定连接规则，每份草稿独立且不携带目录元数据", () => {
    const preset = providerPresets.find(item => item.id === "kimi")!;
    const draft = providerPresetDraft(preset);
    expect(draft).toEqual({
      id: "kimi", name: "Kimi", protocol: "openai-responses",
      baseUrl: "https://api.moonshot.ai/v1", auth: "api_key", usage: "kimi",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }],
      fixedFields: ["protocol", "baseUrl", "auth", "compatibility", "usage"],
    });
    draft.compatibility[0]!.id = "systemMessageInMessages";
    draft.compatibility.push({ id: "toolFilesAsUserMessage" });
    draft.baseUrl = "https://example.test/v1";
    draft.fixedFields!.pop();
    expect(providerPresetDraft(preset).compatibility).toEqual([{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }]);
    expect(providerPresetDraft(preset).fixedFields).toEqual(["protocol", "baseUrl", "auth", "compatibility", "usage"]);
    expect(preset.connection.baseUrl).toBe("https://api.moonshot.ai/v1");
  });

  // 编辑体验以连接自身规则为准；预设可以只固定部分字段，不按名称或端点猜测。
  it("局部固定和自定义连接复用同一字段规则，未知规则拒绝保存", () => {
    const preset = providerPresets[0]!;
    const partial = providerPresetDraft({ ...preset, connection: { ...preset.connection, fixedFields: ["protocol"] } });
    expect(canEditProviderField(partial, "protocol")).toBe(false);
    expect(canEditProviderField(partial, "baseUrl")).toBe(true);
    const custom = providerInputSchema.parse({ ...partial, fixedFields: undefined, enabled: true });
    expect(canEditProviderField(custom, "protocol")).toBe(true);
    expect(canEditProviderField(custom, "compatibility")).toBe(true);
    expect(providerInputSchema.safeParse({ ...custom, fixedFields: ["credential"] }).success).toBe(false);
    expect(providerInputSchema.safeParse({ ...custom, fixedFields: ["auth", "auth"] }).success).toBe(false);
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
