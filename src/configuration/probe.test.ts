import { thinkingLevels } from "@asterism/sdk/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelProvider, ProviderModel } from "../shared/configuration.ts";
import { classifyProbeError, runConnectionProbe } from "./probe.ts";
import { applicationUserAgent } from "../shared/application.ts";

afterEach(() => vi.unstubAllEnvs());
const model: ProviderModel = { providerId: "provider", name: "Test", modelId: "test-model", enabled: true, contextWindow: null, cost: null, compatibility: [],
  capabilities: { reasoning: false, tools: true, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null } };
const provider = (protocol: ModelProvider["protocol"]): ModelProvider => ({ id: "provider", name: "Test", protocol, baseUrl: "http://localhost:9999/v1", enabled: true, auth: "none", compatibility: [], credentialState: "not_required" });
// 独立协议响应样本：分别遵循 Responses、Chat Completions、Messages 的成功响应契约。
const responses = {
  "openai-responses": { id: "resp_1", object: "response", created_at: 1700000000, status: "completed", model: "test-model", error: null, incomplete_details: null,
    output: [{ id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "OK", annotations: [] }] }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } },
  "openai-chat": { id: "chat_1", object: "chat.completion", created: 1700000000, model: "test-model", choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  anthropic: { id: "msg_1", type: "message", role: "assistant", model: "test-model", content: [{ type: "text", text: "OK" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
};
describe("协议连接测试", () => {
  // 无所属会话的 probe 不能共用全局 session ID；它仍携带内置客户端身份并消费 UA 覆盖。
  it("Go 连接测试使用独立临时会话，UA 可由兼容设置覆盖", async () => {
    const connection = { ...provider("openai-responses"), compatibility: [{ id: "opencodeSession" }] };
    const transport = vi.fn<typeof fetch>(async () => Response.json(responses["openai-responses"]));
    const probe = () => runConnectionProbe({ provider: connection, model, apiKey: "", signal: new AbortController().signal }, transport);
    await probe();
    await probe();
    const first = new Headers(transport.mock.calls[0]![1]?.headers);
    const second = new Headers(transport.mock.calls[1]![1]?.headers);
    expect(first.get("user-agent")).toBe(applicationUserAgent);
    expect(first.get("x-opencode-session")).toBeTruthy();
    expect(second.get("x-opencode-session")).toBeTruthy();
    expect(first.get("x-opencode-session")).not.toBe(second.get("x-opencode-session"));
    await runConnectionProbe({ provider: connection, model: { ...model,
      compatibility: [{ id: "customUserAgent", value: { userAgent: "CustomProbe/1.0" } }] },
      apiKey: "", signal: new AbortController().signal }, transport);
    expect(new Headers(transport.mock.calls[2]![1]?.headers).get("user-agent")).toBe("CustomProbe/1.0");
  });
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
    // probe 只验证连通性；模型菜单等级为空时也发送最小请求，省略思考选项。
    await runConnectionProbe({ provider: { ...provider(protocol), compatibility: [{ id: "systemMessageInMessages" }, { id: "responsesReasoning", value: {} }] }, model: { ...model,
      capabilities: { ...model.capabilities, reasoning: true, thinkingLevels: [] },
      compatibility: [{ id: "systemMessageInMessages" }, { id: "responsesReasoning", value: {} }, { id: "toolFilesAsUserMessage" }],
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
