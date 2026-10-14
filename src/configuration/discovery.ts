import { randomUUID } from "node:crypto";
import { z } from "zod";
import { discoveredModelSchema, thinkingSchema, type DiscoveredModel, type ModelDiscovery, type Provider } from "../shared/configuration.ts";
import { validateProviderTransport, ProviderTransportError } from "../model/provider.ts";
import { ConfigurationError } from "./errors.ts";

type DiscoveryError = NonNullable<ModelDiscovery["error"]>;
export class ModelDiscoveryError extends Error {
  constructor(readonly code: DiscoveryError) { super(`Model discovery failed: ${code}.`); }
}
export interface DiscoveryInput { provider: Provider; apiKey: string; signal: AbortSignal }
export type DiscoverModels = (input: DiscoveryInput) => Promise<DiscoveredModel[]>;

const support = z.object({ supported: z.boolean() });
const identity = z.object({ id: discoveredModelSchema.shape.modelId });
const anthropicModelEntry = identity.extend({
  display_name: discoveredModelSchema.shape.name.optional(),
  max_input_tokens: z.number().int().positive().nullish(),
  capabilities: z.object({
    thinking: z.object({ supported: z.boolean(), types: z.object({ disabled: support.optional() }).optional() }).optional(),
    effort: z.record(z.string(), z.unknown()).optional(),
  }).nullish(),
});
const pageSchema = z.object({
  data: z.array(z.unknown()), has_more: z.boolean().optional(), last_id: z.string().nullable().optional(),
});

/** 两种 OpenAI 推理协议共用列表接口；保留连接路径，不猜测其他地址。 */
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
    let page: z.infer<typeof pageSchema>;
    try { page = pageSchema.parse(await response.json()); }
    catch { throw new ModelDiscoveryError("protocol"); }
    for (const raw of page.data) {
      const parsed = identity.safeParse(raw);
      if (!parsed.success) throw new ModelDiscoveryError("protocol");
      const model: DiscoveredModel = { modelId: parsed.data.id, name: parsed.data.id };
      if (provider.protocol === "anthropic") {
        const metadata = anthropicModelEntry.safeParse(raw);
        if (!metadata.success) throw new ModelDiscoveryError("protocol");
        const entry = metadata.data;
        model.name = entry.display_name ?? entry.id;
        if (entry.max_input_tokens != null) model.contextWindow = entry.max_input_tokens;
        const thinking = entry.capabilities?.thinking;
        if (thinking) model.reasoning = thinking.supported;
        const effort = entry.capabilities?.effort;
        if (effort) model.thinkingLevels = thinkingSchema.options.filter(level => level === "off"
          ? thinking?.types?.disabled?.supported === true
          : support.safeParse(effort[level]).data?.supported === true);
      }
      if (!models.has(model.modelId)) models.set(model.modelId, model);
    }
    if (!page.has_more) break;
    // 分页只沿当前端点的游标推进，不消费服务端返回的任意 URL。
    const cursor = page.last_id;
    if (!cursor || cursors.has(cursor) || !page.data.length) throw new ModelDiscoveryError("protocol");
    cursors.add(cursor);
    endpoint.searchParams.set("after_id", cursor);
  }
  return [...models.values()];
}

/** 每个连接保留一次发现结果；刷新、连接变更及关闭终止旧请求，迟到结果不能覆盖新状态。 */
export class ModelDiscoveries {
  private entries = new Map<string, { value: ModelDiscovery; controller: AbortController; timer: ReturnType<typeof setTimeout> }>();
  constructor(private readonly changed: () => void, private readonly discover: DiscoverModels, private readonly timeout: number) {}
  snapshot(): ModelDiscovery[] { return structuredClone([...this.entries.values()].map(entry => entry.value)); }
  get(id: string): ModelDiscovery {
    const entry = this.entries.get(id);
    if (!entry) throw new ConfigurationError("not_found", "The model list is no longer available. Fetch models again.");
    return structuredClone(entry.value);
  }
  start(provider: Provider, credential: () => Promise<string>): string {
    this.clearProvider(provider.id);
    const id = randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      this.finish(id, { state: "failed", error: "timeout", models: [] });
      controller.abort();
    }, this.timeout);
    this.entries.set(id, { controller, timer, value: {
      id, providerId: provider.id, providerRevision: provider.revision, state: "running", models: [], error: null,
    } });
    void this.run(id, provider, credential, controller.signal);
    return id;
  }
  private async run(id: string, provider: Provider, credential: () => Promise<string>, signal: AbortSignal): Promise<void> {
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
