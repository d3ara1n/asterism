import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../shared/configuration.ts";
import { discoverModels } from "./discovery.ts";

const provider: Provider = {
  id: "relay", name: "Relay", baseUrl: "https://example.test/proxy/v1/", protocol: "openai-responses",
  enabled: true, auth: "api_key", credentialState: "available", compatibility: [],
};

describe("模型发现协议与传输边界", () => {
  // 目录格式独立于消息协议；标准 data/id 目录在三种连接下均可使用。
  it.each(["openai-chat", "openai-responses", "anthropic"] as const)("%s 保留路径、携带显式凭据并去重，不按名称猜能力", async protocol => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({
      data: [{ id: "vendor/reasoner" }, { id: "vendor/reasoner" }, { id: "other", capabilities: "nonstandard" }],
    }));
    const result = await discoverModels({ provider: { ...provider, protocol }, apiKey: "test-only", signal: new AbortController().signal }, transport);
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toBe("https://example.test/proxy/v1/models");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(protocol === "anthropic" ? null : "Bearer test-only");
    expect(headers.get("x-api-key")).toBe(protocol === "anthropic" ? "test-only" : null);
    expect(init).toMatchObject({ method: "GET", redirect: "error" });
    expect(result).toEqual([{ modelId: "vendor/reasoner", name: "vendor/reasoner" }, { modelId: "other", name: "other" }]);
  });

  // 目录中的 Anthropic 元数据与分页不能受推理协议限制；无鉴权不发送凭据。
  it.each(["openai-chat", "openai-responses", "anthropic"] as const)("%s 识别 Anthropic 元数据并沿游标分页", async protocol => {
    const calls: string[] = [];
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      calls.push(String(url));
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("x-api-key")).toBeNull();
      expect(headers.get("anthropic-version")).toBe(protocol === "anthropic" ? "2023-06-01" : null);
      return Response.json(calls.length === 1 ? {
        data: [{ id: "first", display_name: "First", max_input_tokens: 200000,
          capabilities: { thinking: { supported: true, types: { disabled: { supported: true } } },
            effort: { low: { supported: true }, high: { supported: true }, max: { supported: false } } } }],
        has_more: true, last_id: "first",
      } : { data: [{ id: "second" }], has_more: false });
    });
    const result = await discoverModels({ provider: { ...provider, protocol, auth: "none" }, apiKey: "must-not-send", signal: new AbortController().signal }, transport);
    expect(calls).toEqual(["https://example.test/proxy/v1/models", "https://example.test/proxy/v1/models?after_id=first"]);
    expect(result).toEqual([
      { modelId: "first", name: "First", contextWindow: 200000, reasoning: true, thinkingLevels: ["off", "low", "high"] },
      { modelId: "second", name: "second" },
    ]);
  });

  // 智谱 /api/v1/models 实测使用 models/slug；同一目录不因推理协议或域名不同而被拒绝。
  it.each(["openai-chat", "openai-responses", "anthropic"] as const)("%s 识别 Codex 风格目录，只导入已适配的资料", async protocol => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ models: [
      { slug: "glm-5.3", display_name: "GLM 5.3", context_window: 1048576,
        supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }, { effort: "max" }],
        base_instructions: "Client instructions", experimental_supported_tools: ["shell"] },
      { slug: "glm-5-turbo", supported_reasoning_levels: [] },
      { slug: "glm-5.3" },
    ] }));
    expect(await discoverModels({ provider: { ...provider, protocol }, apiKey: "test", signal: new AbortController().signal }, transport)).toEqual([
      { modelId: "glm-5.3", name: "GLM 5.3" },
      { modelId: "glm-5-turbo", name: "glm-5-turbo" },
    ]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  // Anthropic 鉴权不是 Bearer；服务端错误正文可能包含凭据，不能传回界面。
  it("Anthropic 使用 x-api-key，错误只传固定分类", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("private-test-key");
      expect(headers.get("authorization")).toBeNull();
      return new Response("private-test-key", { status: 401 });
    });
    await expect(discoverModels({ provider: { ...provider, protocol: "anthropic" }, apiKey: "private-test-key", signal: new AbortController().signal }, transport))
      .rejects.toMatchObject({ code: "authentication", message: "Model discovery failed: authentication." });
  });

  // 缺少接口与合法空列表是不同结果；坏响应和重复游标不能显示成成功的部分目录。
  it("区分空列表、接口缺失和不合法分页", async () => {
    const input = { provider, apiKey: "test", signal: new AbortController().signal };
    expect(await discoverModels(input, async () => Response.json({ data: [] }))).toEqual([]);
    await expect(discoverModels(input, async () => new Response("", { status: 404 }))).rejects.toMatchObject({ code: "unsupported" });
    expect(await discoverModels(input, async () => Response.json({ models: [] }))).toEqual([]);
    const repeated = vi.fn<typeof fetch>(async () => Response.json({ data: [{ id: "same" }], has_more: true, last_id: "same" }));
    await expect(discoverModels(input, repeated)).rejects.toMatchObject({ code: "protocol" });
    expect(repeated).toHaveBeenCalledTimes(2);
  });

  // 猜测仅限已知结构：不能把未知、歧义或损坏响应降级成成功的空列表或部分目录。
  it.each([
    { label: "未知结构", body: { items: [] } },
    { label: "歧义目录", body: { data: [], models: [{ slug: "other" }] } },
    { label: "Codex 条目缺少 slug", body: { models: [{ slug: "valid" }, { id: "wrong-field" }] } },
    { label: "Anthropic 已识别元数据损坏", body: { data: [{ id: "model", capabilities: { thinking: { supported: "yes" } } }] } },
  ])("拒绝$label", async ({ body }) => {
    const transport = vi.fn<typeof fetch>(async () => Response.json(body));
    await expect(discoverModels({ provider, apiKey: "test", signal: new AbortController().signal }, transport))
      .rejects.toMatchObject({ code: "protocol", message: "Model discovery failed: protocol." });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  // 发现与执行遵守同一 HTTPS 规则，错误配置不能把密钥发到远程明文连接。
  it("远程 HTTP 带凭据时在发请求前拒绝", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(discoverModels({ provider: { ...provider, baseUrl: "http://example.test/v1" }, apiKey: "test", signal: new AbortController().signal }, transport))
      .rejects.toMatchObject({ code: "configuration" });
    expect(transport).not.toHaveBeenCalled();
  });
});
