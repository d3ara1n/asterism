import { describe, expect, it, vi } from "vitest";
import type { ModelResponse, UsageItem } from "@asterism-app/sdk/contracts";
import { UsageQueryError, type ModelProviderInfo, type ModelProviderServices, type UsageProvider, type UsageProviderServices } from "@asterism-app/sdk/runtime";
import { waitForUsage, ProviderUsageService } from "./usage.ts";

const items: UsageItem[] = [{ id: "quota", label: "Quota", scope: "connection", type: "quota", category: "rate_limit",
  value: { type: "ratio", remaining: 0.4 }, window: { mode: "unknown", durationMs: null, resetAt: null } }];
function setup(provider: UsageProvider) {
  let connection: ModelProviderInfo = { id: "p", name: "P", protocol: "openai-chat", baseUrl: "https://example.test/v1",
    auth: "api_key", enabled: true, compatibility: [], usage: provider.id };
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const credential = vi.fn(async () => "private-key");
  const modelProviders: ModelProviderServices = { list: () => [connection], get: () => connection, presets: () => [], credential, subscribe };
  const usageProviders: UsageProviderServices = { list: () => [], get: () => provider, subscribe };
  const changed = vi.fn();
  const usage = new ProviderUsageService(modelProviders, usageProviders, changed);
  return { usage, credential, changed, response: (): ModelResponse => ({ connection: { id: connection.id },
    endpoint: connection.baseUrl, model: "model", receivedAt: Date.now(), status: 429, headers: { quota: "yes" } }),
    change(next = provider) {
      provider = next;
      connection = { ...connection, baseUrl: "https://new.test/v1", usage: provider.id };
      for (const listener of listeners) listener();
    } };
}

describe("shared provider usage", () => {
  // A canceled wait must still handle rejection of the original Promise to avoid unhandledRejection.
  it("a canceled wait still handles asynchronous rejection", async () => {
    const reason = new Error("cancelled");
    await expect(waitForUsage(Promise.reject(new Error("credential failed")), AbortSignal.abort(reason))).rejects.toBe(reason);
    await new Promise<void>(resolve => setImmediate(resolve));
  });
  // Shutdown occurs between query queuing and credential retrieval; the credential service must no longer be accessed.
  it("immediate shutdown prevents credential reads that have not started", async () => {
    const fixture = setup({ id: "q", label: "Q", query: async () => [] });
    const pending = fixture.usage.query("p");
    fixture.usage.close();
    expect(await pending).toMatchObject({ state: "error", error: "unavailable", items: [] });
    expect(fixture.credential).not.toHaveBeenCalled();
  });
  // Reading passive sources retrieves no credentials; null retains existing data, and an empty list clears it. Parsing errors do not affect the Agent's consumption of model results.
  it("updates after the caller supplies a response, retains data when none is supplied, and preserves reported data while isolating errors", async () => {
    const parseHeaders = vi.fn((): UsageItem[] | null => items);
    const fixture = setup({ id: "headers", label: "Headers", source: "headers", parseHeaders });
    try {
      expect(await fixture.usage.query("p", { refresh: true })).toMatchObject({ state: "waiting", items: [] });
      fixture.usage.consume(fixture.response());
      const first = await fixture.usage.query("p");
      expect(first).toMatchObject({ source: "headers", model: "model", state: "ready", items });
      expect(fixture.credential).not.toHaveBeenCalled();
      expect(parseHeaders.mock.calls[0]).toEqual([expect.objectContaining({ status: 429, headers: { quota: "yes" } })]);
      parseHeaders.mockReturnValueOnce(null);
      fixture.usage.consume(fixture.response());
      expect(await fixture.usage.query("p")).toEqual(first);
      parseHeaders.mockImplementationOnce(() => { throw new UsageQueryError("protocol"); });
      expect(() => fixture.usage.consume(fixture.response())).not.toThrow();
      expect(await fixture.usage.query("p")).toMatchObject({ state: "error", error: "protocol", items });
      parseHeaders.mockReturnValueOnce([]);
      fixture.usage.consume(fixture.response());
      expect(await fixture.usage.query("p")).toMatchObject({ state: "ready", items: [] });
    } finally { fixture.usage.close(); }
  });
  // Responses use the connection's current usage configuration; changes to the endpoint captured by the request do not invalidate returned results.
  it("connection changes clear the cache, and late responses are still consumed using the current catalog", async () => {
    const parseHeaders = vi.fn(() => items);
    const fixture = setup({ id: "headers", label: "Headers", source: "headers", parseHeaders });
    try {
      const response = fixture.response();
      fixture.change();
      expect(await fixture.usage.query("p")).toMatchObject({ state: "waiting", items: [] });
      fixture.usage.consume(response);
      expect(parseHeaders).toHaveBeenCalledOnce();
      expect(await fixture.usage.query("p")).toMatchObject({ state: "ready", items });
    } finally { fixture.usage.close(); }
  });
});
