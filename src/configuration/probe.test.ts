import { thinkingLevels } from "@atelier/sdk/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Provider, ProviderModel } from "../shared/configuration.ts";
import { classifyProbeError, runConnectionProbe } from "./probe.ts";

afterEach(() => vi.unstubAllEnvs());
const model: ProviderModel = { providerId: "provider", revision: 1, name: "Test", modelId: "test-model", enabled: true, contextWindow: null, compatibility: [],
  capabilities: { reasoning: false, tools: true, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null } };
const provider = (protocol: Provider["protocol"]): Provider => ({ id: "provider", revision: 1, name: "Test", protocol, baseUrl: "http://localhost:9999/v1", enabled: true, auth: "none", credentialState: "not_required" });
// 独立协议响应样本：分别遵循 Responses、Chat Completions、Messages 的成功响应契约。
const responses = {
  "openai-responses": { id: "resp_1", object: "response", created_at: 1700000000, status: "completed", model: "test-model", error: null, incomplete_details: null,
    output: [{ id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "OK", annotations: [] }] }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } },
  "openai-chat": { id: "chat_1", object: "chat.completion", created: 1700000000, model: "test-model", choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  anthropic: { id: "msg_1", type: "message", role: "assistant", model: "test-model", content: [{ type: "text", text: "OK" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
};
describe("协议连接测试", () => {
  it("不会把 API key 发送到远程明文 HTTP 端点", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(runConnectionProbe({ provider: { ...provider("openai-chat"), auth: "api_key", baseUrl: "http://example.test/v1" },
      model, apiKey: "must-not-be-sent", signal: new AbortController().signal }, transport)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(["openai-responses", "openai-chat", "anthropic"] as const)("%s 显式请求正确端点，无鉴权时不使用环境密钥", async protocol => {
    vi.stubEnv("OPENAI_API_KEY", "environment-key-must-not-be-used");
    vi.stubEnv("ANTHROPIC_API_KEY", "environment-key-must-not-be-used");
    const transport = vi.fn<typeof fetch>(async () => Response.json(responses[protocol]));
    // probe 只验证连通性；即使执行没有可用思考等级，也不参与等级选择或能力校验。
    await runConnectionProbe({ provider: provider(protocol), model: { ...model,
      capabilities: { ...model.capabilities, reasoning: true, thinkingLevels: [] },
      compatibility: [{ id: "systemMessageInMessages" }, { id: "thinkingInDeepSeekFormat" }, { id: "toolFilesAsUserMessage" }],
      generation: { temperature: 0.3, topP: 0.8, maxOutputTokens: 1000 } },
      apiKey: "", signal: new AbortController().signal }, transport);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0]!;
    const suffix = protocol === "openai-responses" ? "/responses" : protocol === "openai-chat" ? "/chat/completions" : "/messages";
    expect(String(url)).toBe("http://localhost:9999/v1" + suffix);
    const headers = new Headers(init?.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("x-api-key")).toBe(false);
    expect(JSON.stringify(init)).not.toContain("environment-key-must-not-be-used");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "test-model", temperature: 0.3, top_p: 0.8 });
    expect(body.max_output_tokens ?? body.max_tokens ?? body.max_completion_tokens).toBe(128);
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("thinking");
    if (protocol === "openai-responses") {
      expect(body.store).toBe(false);
      expect(body).not.toHaveProperty("include");
      expect(body).not.toHaveProperty("instructions");
    }
    expect(init?.redirect).toBe("error");
  });
  it("鉴权错误不重试，不回传服务端错误中的密钥", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ error: { message: "echoed-secret", type: "authentication_error", code: "invalid_api_key" } }, { status: 401 }));
    let failure: unknown;
    try { await runConnectionProbe({ provider: { ...provider("openai-chat"), auth: "api_key" }, model, apiKey: "test-key", signal: new AbortController().signal }, transport); }
    catch (error) { failure = error; }
    expect(transport).toHaveBeenCalledTimes(1);
    expect(new Headers(transport.mock.calls[0]![1]?.headers).get("authorization")).toBe("Bearer test-key");
    expect(classifyProbeError(failure).error).toBe("authentication");
    expect(JSON.stringify(classifyProbeError(failure))).not.toMatch(/echoed-secret|test-key/);
  });
});
