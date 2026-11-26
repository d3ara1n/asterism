import { describe, expect, it, vi } from "vitest";
import { createKiloUsage } from "./kilo.ts";

describe("Kilo Gateway personal credits", () => {
  const context = { connection: { id: "renamed", endpoint: "https://ai-gateway.kilo.ai/api/v1" }, credential: { kind: "api_key" as const, key: "test-key" },
    signal: new AbortController().signal };

  it("only sends the bearer to Kilo's official companion API for a Kilo Gateway connection", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ balance: 12.34 }));
    const provider = createKiloUsage(transport);
    await expect(provider.query({ ...context, connection: { ...context.connection, endpoint: "https://ai-gateway.kilo.ai.example/v1" } }))
      .rejects.toMatchObject({ code: "unsupported" });
    expect(transport).not.toHaveBeenCalled();
    expect(await provider.query(context)).toMatchObject([{ scope: "account", remaining: 12.34, unit: { code: "USD" } }]);
    expect(String(transport.mock.calls[0]?.[0])).toBe("https://api.kilo.ai/api/profile/balance");
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer test-key" } });
  });
});
