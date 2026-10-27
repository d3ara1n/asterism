import { describe, expect, it, vi } from "vitest";
import { AiSdkAdapter } from "./ai-sdk.ts";
import { modelRequestHeaders } from "./request-identity.ts";
import { modelCompatibilitySchema } from "../shared/model-compatibility.ts";
import type { ModelInput } from "./contract.ts";

describe("Model request identity", () => {
  // The SDK public interface imposes no Asterism identity and does not automatically send session headers based on domain.
  it("generates no identity headers without declared identity or compatibility packages", () => {
    expect([...modelRequestHeaders({ provider: { compatibility: [] }, model: { compatibility: [] } })]).toEqual([]);
  });

  // HTTP headers forbid control characters; configuration saves and runtime reject before reading credentials or sending requests.
  it("rejects empty UAs and unencodable request identities", () => {
    for (const userAgent of ["", "Agent\r\nX-Test: value", "客户端"]) {
      expect(modelCompatibilitySchema.safeParse([{ id: "customUserAgent", value: { userAgent } }]).success).toBe(false);
    }
    const credential = vi.fn(async () => "unused");
    const adapter = new AiSdkAdapter(credential);
    const input: ModelInput = {
      settings: {
        provider: { id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid/v1",
          auth: "api_key", enabled: true, compatibility: [{ id: "opencodeSession" }] },
        model: { providerId: "test", modelId: "test", name: "Test", enabled: true, contextWindow: null, cost: null,
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
