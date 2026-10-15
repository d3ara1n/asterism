import { describe, expect, it, vi } from "vitest";
import { AiSdkAdapter } from "./ai-sdk.ts";
import { modelRequestHeaders } from "./request-identity.ts";
import { modelCompatibilitySchema } from "../shared/model-compatibility.ts";
import type { ModelInput } from "./contract.ts";

describe("模型请求身份", () => {
  // SDK 公共接口不强加 Atelier 身份，也不按域名自动发送会话头。
  it("未声明身份或兼容包时不生成身份头", () => {
    expect([...modelRequestHeaders({ provider: { compatibility: [] }, model: { compatibility: [] } })]).toEqual([]);
  });

  // HTTP 头不允许控制字符；配置保存和运行时都在读取凭据／发请求前拒绝。
  it("拒绝空 UA 和无法编码的请求身份", () => {
    for (const userAgent of ["", "Agent\r\nX-Test: value", "客户端"]) {
      expect(modelCompatibilitySchema.safeParse([{ id: "customUserAgent", value: { userAgent } }]).success).toBe(false);
    }
    const credential = vi.fn(async () => "unused");
    const adapter = new AiSdkAdapter(credential);
    const input: ModelInput = {
      settings: {
        provider: { id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid/v1",
          auth: "api_key", enabled: true, revision: 1, compatibility: [{ id: "opencodeSession" }] },
        model: { providerId: "test", modelId: "test", name: "Test", enabled: true, revision: 1, contextWindow: null, cost: null,
          capabilities: { reasoning: false, thinkingLevels: [], tools: false }, compatibility: [],
          generation: { temperature: null, topP: null, maxOutputTokens: null } },
        thinking: null,
      },
      system: { blocks: [] }, messages: [], tools: [],
      userAgent: "Agent/1.0", sessionId: "bad\nsession",
    };
    expect(() => adapter.prepare(input)).toThrow("Session ID");
    input.sessionId = "session";
    input.userAgent = "";
    expect(() => adapter.prepare(input)).toThrow("User-Agent");
    expect(credential).not.toHaveBeenCalled();
  });
});
