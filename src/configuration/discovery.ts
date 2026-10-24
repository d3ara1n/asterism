import { randomUUID } from "node:crypto";
import type { DiscoveredModel, ModelDiscovery, ModelProvider } from "../shared/configuration.ts";
import { validateProviderTransport, ProviderTransportError } from "../model/provider.ts";
import { ConfigurationError } from "./errors.ts";
import { parseModelListPage, type ModelListPage } from "./discovery-format.ts";

type DiscoveryError = NonNullable<ModelDiscovery["error"]>;
export class ModelDiscoveryError extends Error {
  constructor(readonly code: DiscoveryError) { super(`Model discovery failed: ${code}.`); }
}
export interface DiscoveryInput { provider: ModelProvider; apiKey: string; signal: AbortSignal }
export type DiscoverModels = (input: DiscoveryInput) => Promise<DiscoveredModel[]>;

/** 保留连接路径与鉴权约定，目录响应格式由独立解析器识别。 */
export async function discoverModels({ provider, apiKey, signal }: DiscoveryInput, transport: typeof fetch = fetch): Promise<DiscoveredModel[]> {
  validateProviderTransport(provider);
  const endpoint = new URL(`${provider.baseUrl.replace(/\/+$/, "")}/models`);
  const headers = new Headers({ accept: "application/json" });
  if (provider.protocol === "anthropic") headers.set("anthropic-version", "2023-06-01");
  if (provider.auth === "api_key") {
    if (!apiKey) throw new ModelDiscoveryError("credential");
    headers.set(provider.protocol === "anthropic" ? "x-api-key" : "authorization",
      provider.protocol === "anthropic" ? apiKey : `Bearer ${apiKey}`);
  }
  const models = new Map<string, DiscoveredModel>();
  const cursors = new Set<string>();
  for (;;) {
    signal.throwIfAborted();
    const response = await transport(endpoint, { method: "GET", headers, signal, redirect: "error" });
    if (!response.ok) {
      await response.body?.cancel();
      const status = response.status;
      throw new ModelDiscoveryError(status === 401 || status === 403 ? "authentication"
        : status === 404 || status === 405 || status === 501 ? "unsupported"
        : status === 429 ? "rate_limit" : status >= 500 ? "server" : "protocol");
    }
    let page: ModelListPage;
    try { page = parseModelListPage(await response.json()); }
    catch { throw new ModelDiscoveryError("protocol"); }
    for (const model of page.models) {
      if (!models.has(model.modelId)) models.set(model.modelId, model);
    }
    if (!page.hasMore) break;
    // 分页只沿当前端点的游标推进，不消费服务端返回的任意 URL。
    const cursor = page.lastId;
    if (!cursor || cursors.has(cursor) || !page.models.length) throw new ModelDiscoveryError("protocol");
    cursors.add(cursor);
    endpoint.searchParams.set("after_id", cursor);
  }
  return [...models.values()];
}

/** 每个连接保留一次发现结果；刷新、删除连接及关闭时取消请求。 */
export class ModelDiscoveries {
  private entries = new Map<string, { value: ModelDiscovery; controller: AbortController; timer: ReturnType<typeof setTimeout> }>();
  constructor(private readonly changed: () => void, private readonly discover: DiscoverModels, private readonly timeout: number) {}
  snapshot(): ModelDiscovery[] { return structuredClone([...this.entries.values()].map(entry => entry.value)); }
  get(id: string): ModelDiscovery {
    const entry = this.entries.get(id);
    if (!entry) throw new ConfigurationError("not_found", "The model list is no longer available. Fetch models again.");
    return structuredClone(entry.value);
  }
  start(provider: ModelProvider, credential: () => Promise<string>): string {
    this.clearProvider(provider.id);
    const id = randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      this.finish(id, { state: "failed", error: "timeout", models: [] });
      controller.abort();
    }, this.timeout);
    this.entries.set(id, { controller, timer, value: {
      id, providerId: provider.id, state: "running", models: [], error: null,
    } });
    void this.run(id, provider, credential, controller.signal);
    return id;
  }
  private async run(id: string, provider: ModelProvider, credential: () => Promise<string>, signal: AbortSignal): Promise<void> {
    let apiKey: string;
    try { apiKey = await credential(); }
    catch { this.finish(id, { state: "failed", error: "credential", models: [] }); return; }
    if (signal.aborted) return;
    try {
      const models = await this.discover({ provider, apiKey, signal });
      this.finish(id, { state: "succeeded", error: null, models });
    } catch (error) {
      this.finish(id, { state: "failed", models: [], error: error instanceof ModelDiscoveryError ? error.code
        : error instanceof ProviderTransportError ? "configuration" : "network" });
    }
  }
  private finish(id: string, result: Pick<ModelDiscovery, "state" | "error" | "models">): void {
    const entry = this.entries.get(id);
    if (!entry || entry.value.state !== "running") return;
    clearTimeout(entry.timer);
    Object.assign(entry.value, result);
    this.changed();
  }
  cancel(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.finish(id, { state: "cancelled", error: "cancelled", models: [] });
    entry.controller.abort();
  }
  clearProvider(providerId: string): void {
    for (const [id, entry] of this.entries) if (entry.value.providerId === providerId) {
      clearTimeout(entry.timer);
      this.entries.delete(id);
      entry.controller.abort();
    }
  }
  close(): void {
    for (const entry of this.entries.values()) { clearTimeout(entry.timer); entry.controller.abort(); }
    this.entries.clear();
  }
}
