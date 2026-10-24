import { z } from "zod";
import { webProviderTypeSchema, webResponseSchema, webSearchRequestSchema, webFetchRequestSchema,
  type WebProviderConnection, type WebProviderType, type WebSearchRequest, type WebFetchRequest } from "@atelier/sdk/contracts";
import { WebError, type WebProviderDefinition, type WebProviderInstance, type WebProviderServices, type WebServices } from "@atelier/sdk/runtime";
import type { RunGroup } from "../plugins/lifecycle.ts";
import { synchronous } from "../plugins/synchronous.ts";

/** 完整 URL glob：仅 * 为通配符，其余字符按字面匹配。 */
export function matchesWebUrl(pattern: string, url: string): boolean {
  const expression = pattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join(".*");
  return new RegExp(`^${expression}$`, "u").test(new URL(url).href);
}
export function matchWebProvider(
  connections: readonly Pick<WebProviderConnection, "id" | "type" | "enabled">[],
  types: readonly Pick<WebProviderType, "id" | "fetch" | "urlPatterns">[],
  url: string,
): string | null {
  for (const connection of connections) {
    if (!connection.enabled) continue;
    const type = types.find(type => type.id === connection.type);
    if (!type?.fetch) continue;
    for (const pattern of type.urlPatterns) if (matchesWebUrl(pattern, url)) return connection.id;
  }
  return null;
}
interface Entry { owner: string; definition: WebProviderDefinition; info: WebProviderType; runs: RunGroup }
interface Connections {
  list(): WebProviderConnection[];
  capture(id: string): { connection: WebProviderConnection; credential(): Promise<string | null> };
}
/** 目录只保存类型；每次解析取用连接与凭据，结果沿普通工具返回。 */
export class WebProviderRegistry implements WebProviderServices, WebServices {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  constructor(private readonly connections: Connections) {}
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  changed() { for (const listener of this.listeners) listener(); }
  types(): WebProviderType[] { return [...this.entries.values()].map(entry => structuredClone(entry.info)); }
  list(): WebProviderConnection[] { return this.connections.list(); }
  get(id: string) { return this.list().find(connection => connection.id === id) ?? null; }
  declare(owner: string, definitions: readonly WebProviderDefinition[], runs: RunGroup) {
    const ids = new Set(this.entries.keys());
    const entries = definitions.map(definition => {
      if (ids.has(definition.id)) throw new Error(`Duplicate web provider type: ${definition.id}`);
      ids.add(definition.id);
      if (!definition.search && !definition.fetch) throw new Error("A web provider declares at least one operation.");
      if (definition.fetch && !definition.urlPatterns.length) throw new Error("A fetch provider declares URL patterns.");
      if (typeof definition.create !== "function") throw new Error("A web provider supplies a synchronous factory.");
      const defaults = { ...definition.defaults, settings: definition.settingsSchema.parse(definition.defaults.settings) };
      const info = webProviderTypeSchema.parse({ ...definition, owner, defaults, settingsSchema: z.toJSONSchema(definition.settingsSchema) });
      return { owner, definition: { ...definition, defaults, urlPatterns: [...definition.urlPatterns] }, info, runs };
    });
    for (const entry of entries) this.entries.set(entry.info.id, entry);
    this.changed();
  }
  removeOwners(owners: readonly string[]) {
    let changed = false;
    for (const [id, entry] of this.entries) if (owners.includes(entry.owner)) { this.entries.delete(id); changed = true; }
    if (changed) this.changed();
  }
  validate(connection: WebProviderConnection): WebProviderConnection {
    const entry = this.entries.get(connection.type);
    if (!entry) throw new WebError("provider_unavailable", `Web provider type '${connection.type}' is unavailable.`);
    const parsed = entry.definition.settingsSchema.safeParse(connection.settings);
    if (!parsed.success) throw new WebError("invalid_request", `Invalid web provider settings: ${parsed.error.message}`);
    return { ...connection, settings: parsed.data };
  }
  private capture(id: string) {
    const captured = this.connections.capture(id);
    const entry = this.entries.get(captured.connection.type);
    if (!entry || entry.runs.closed || !captured.connection.enabled)
      throw new WebError("provider_unavailable", `Web provider '${id}' is unavailable or disabled.`);
    const connection = this.validate(captured.connection);
    return { ...captured, connection, entry };
  }
  private async instance(captured: ReturnType<WebProviderRegistry["capture"]>, signal: AbortSignal): Promise<WebProviderInstance> {
    signal.throwIfAborted();
    const { entry, connection } = captured;
    const instance = await entry.runs.start(async scope => {
      scope.throwIfAborted();
      const credential = await captured.credential();
      scope.throwIfAborted();
      if (connection.auth === "api_key" && !credential) throw new WebError("credential_unavailable", "Enter the web provider API key in settings.");
      return synchronous(() => entry.definition.create({ connection: structuredClone(connection), credential }));
    }, { signal, affectsHistory: false }).done;
    if (entry.info.search && typeof instance.search !== "function" || entry.info.fetch && typeof instance.fetch !== "function")
      throw new WebError("protocol", "The web provider instance does not implement its declared operations.");
    const invoke = <T>(work: (signal: AbortSignal) => Promise<T>, callSignal: AbortSignal) => {
      if (this.entries.get(entry.info.id) !== entry || entry.runs.closed) throw new WebError("provider_unavailable", "The web provider is unavailable.");
      return entry.runs.start(async scope => {
        scope.throwIfAborted();
        const result = await work(scope);
        scope.throwIfAborted();
        return result;
      }, { signal: callSignal, affectsHistory: false }).done;
    };
    const decode = (raw: unknown) => {
      const parsed = webResponseSchema.safeParse(raw);
      if (!parsed.success) throw new WebError("protocol", `Invalid web provider result: ${parsed.error.message}`);
      return parsed.data;
    };
    return {
      ...(entry.info.search && { search: (request: WebSearchRequest, options: { signal: AbortSignal }) => invoke(async scope =>
        decode(await instance.search!(webSearchRequestSchema.parse(request), { signal: scope })), options.signal) }),
      ...(entry.info.fetch && { fetch: (request: WebFetchRequest, options: { signal: AbortSignal }) => invoke(async scope =>
        decode(await instance.fetch!(webFetchRequestSchema.parse(request), { signal: scope })), options.signal) }),
    };
  }
  resolve(id: string, options: { signal: AbortSignal }): Promise<WebProviderInstance> {
    return this.instance(this.capture(id), options.signal);
  }
  async search(request: WebSearchRequest, options: { provider: string; signal: AbortSignal }) {
    const captured = this.capture(options.provider);
    if (!captured.entry.info.search) throw new WebError("unsupported", "This provider does not support web search.");
    const instance = await this.instance(captured, options.signal);
    return { ...await instance.search!(request, options), query: request.query, provider: this.identity(captured.connection) };
  }
  async fetch(request: WebFetchRequest, options: { signal: AbortSignal }) {
    const input = webFetchRequestSchema.parse(request);
    const id = matchWebProvider(this.list(), this.types(), input.url);
    if (id === null) throw new WebError("provider_unavailable", "No enabled web provider matches this URL. Configure a web provider in settings.");
    const captured = this.capture(id);
    const instance = await this.instance(captured, options.signal);
    return { ...await instance.fetch!(input, options), requestedUrl: input.url, provider: this.identity(captured.connection) };
  }
  private identity(connection: WebProviderConnection) { return { id: connection.id, name: connection.name, type: connection.type }; }
}
