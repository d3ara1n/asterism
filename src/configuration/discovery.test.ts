import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../shared/configuration.ts";
import { discoverModels } from "./discovery.ts";

const provider: Provider = {
  id: "relay", name: "Relay", baseUrl: "https://example.test/proxy/v1/", protocol: "openai-responses",
  enabled: true, auth: "api_key", credentialState: "available", revision: 1, compatibility: [],
};

describe("模型发现协议与传输边界", () => {
  // 基础路径是连接契约的一部分；两种 OpenAI 推理协议使用同一个 /models 目录。
  it.each(["openai-chat", "openai-responses"] as const)("%s 保留路径、携带显式凭据并去重，不按名称猜能力", async protocol => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({
      data: [{ id: "vendor/reasoner" }, { id: "vendor/reasoner" }, { id: "other", capabilities: "nonstandard" }],
    }));
    const result = await discoverModels({ provider: { ...provider, protocol }, apiKey: "test-only", signal: new AbortController().signal }, transport);
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toBe("https://example.test/proxy/v1/models");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-only");
    expect(init).toMatchObject({ method: "GET", redirect: "error" });
    expect(result).toEqual([{ modelId: "vendor/reasoner", name: "vendor/reasoner" }, { modelId: "other", name: "other" }]);
  });

  // 无鉴权不应泄漏调用方或环境中的 key；Anthropic 分页必须取完才能交付列表。
  it("Anthropic 使用版本头并沿游标分页，无鉴权不发送认证头", async () => {
    const calls: string[] = [];
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      calls.push(String(url));
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("x-api-key")).toBeNull();
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
      return Response.json(calls.length === 1 ? {
        data: [{ id: "first", display_name: "First", max_input_tokens: 200000,
          capabilities: { thinking: { supported: true, types: { disabled: { supported: true } } },
            effort: { low: { supported: true }, high: { supported: true }, max: { supported: false } } } }],
        has_more: true, last_id: "first",
      } : { data: [{ id: "second" }], has_more: false });
    });
    const result = await discoverModels({ provider: { ...provider, protocol: "anthropic", auth: "none" }, apiKey: "must-not-send", signal: new AbortController().signal }, transport);
    expect(calls).toEqual(["https://example.test/proxy/v1/models", "https://example.test/proxy/v1/models?after_id=first"]);
    expect(result).toEqual([
      { modelId: "first", name: "First", contextWindow: 200000, reasoning: true, thinkingLevels: ["off", "low", "high"] },
      { modelId: "second", name: "second" },
    ]);
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
    await expect(discoverModels(input, async () => Response.json({ models: [] }))).rejects.toMatchObject({ code: "protocol" });
    const repeated = vi.fn<typeof fetch>(async () => Response.json({ data: [{ id: "same" }], has_more: true, last_id: "same" }));
    await expect(discoverModels(input, repeated)).rejects.toMatchObject({ code: "protocol" });
    expect(repeated).toHaveBeenCalledTimes(2);
  });

  // 发现与执行遵守同一 HTTPS 规则，错误配置不能把密钥发到远程明文连接。
  it("远程 HTTP 带凭据时在发请求前拒绝", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(discoverModels({ provider: { ...provider, baseUrl: "http://example.test/v1" }, apiKey: "test", signal: new AbortController().signal }, transport))
      .rejects.toMatchObject({ code: "configuration" });
    expect(transport).not.toHaveBeenCalled();
  });
});
