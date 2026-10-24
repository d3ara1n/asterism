import { webProviderTypeSchema, webResponseSchema, webSearchRequestSchema, webFetchRequestSchema,
  type WebProviderState, type WebProviderType, type WebSearchRequest, type WebFetchRequest, type WebResponse } from "@atelier/sdk/contracts";
import { WebError, type WebProviderDefinition, type WebProviderInstance, type WebProviderServices, type WebServices } from "@atelier/sdk/runtime";
import type { RunGroup } from "../plugins/lifecycle.ts";

/** 完整 URL glob：仅 * 为通配符，其余字符按字面匹配。 */
export function matchesWebUrl(pattern: string, url: string): boolean {
  const expression = pattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join(".*");
  return new RegExp(`^${expression}$`, "u").test(new URL(url).href);
}
export function matchWebProvider(
  states: readonly Pick<WebProviderState, "id" | "enabled">[],
  types: readonly Pick<WebProviderType, "id" | "fetch" | "urlPatterns">[],
  url: string,
): string | null {
  for (const state of states) {
    if (!state.enabled) continue;
    const type = types.find(type => type.id === state.id);
    if (!type?.fetch) continue;
    for (const pattern of type.urlPatterns) if (matchesWebUrl(pattern, url)) return state.id;
  }
  return null;
}

/** 每份文档的正文块共享字符预算；只标记实际裁掉的内容，保留上游已有标记。 */
export function limitWebBody(response: WebResponse, maxCharacters?: number): WebResponse {
  if (maxCharacters === undefined) return response;
  return { ...response, documents: response.documents.map(document => {
    let remaining = maxCharacters;
    return { ...document, content: document.content.map(part => {
      if (part.kind !== "body") return part;
      const characters = Array.from(part.text);
      const length = Math.min(characters.length, remaining);
      remaining -= length;
      return length < characters.length ? { ...part, text: characters.slice(0, length).join(""), truncated: true } : part;
    }) };
  }) };
}

interface Entry { owner: string; definition: WebProviderDefinition; info: WebProviderType; runs: RunGroup }
interface Connections {
  list(): WebProviderState[];
  credential(id: string): Promise<string | null>;
}

/** 目录只保存类型；每次调用取用当前状态与凭据，不缓存实例。 */
export class WebProviderRegistry implements WebProviderServices, WebServices {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  constructor(private readonly connections: Connections) {}
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  changed() { for (const listener of this.listeners) listener(); }
  types(): WebProviderType[] { return [...this.entries.values()].map(entry => structuredClone(entry.info)); }
  list(): WebProviderState[] { return this.connections.list(); }
  get(id: string) { return this.list().find(state => state.id === id) ?? null; }
  declare(owner: string, definitions: readonly WebProviderDefinition[], runs: RunGroup) {
    const ids = new Set(this.entries.keys());
    const entries = definitions.map(definition => {
      if (ids.has(definition.id)) throw new Error(`Duplicate web provider type: ${definition.id}`);
      ids.add(definition.id);
      if (!definition.search && !definition.fetch) throw new Error("A web provider declares at least one operation.");
      if (definition.fetch && !definition.urlPatterns.length) throw new Error("A fetch provider declares URL patterns.");
      if (typeof definition.create !== "function") throw new Error("A web provider supplies a synchronous factory.");
      const info = webProviderTypeSchema.parse({
        id: definition.id, label: definition.label, owner,
        search: definition.search, fetch: definition.fetch, urlPatterns: [...definition.urlPatterns],
        credential: definition.credential ?? null,
      });
      return { owner, definition, info, runs };
    });
    for (const entry of entries) this.entries.set(entry.info.id, entry);
    this.changed();
  }
  removeOwners(owners: readonly string[]) {
    let changed = false;
    for (const [id, entry] of this.entries) if (owners.includes(entry.owner)) { this.entries.delete(id); changed = true; }
    if (changed) this.changed();
  }
  private captureEntry(id: string) {
    const state = this.connections.list().find(s => s.id === id);
    if (!state?.enabled) throw new WebError("provider_unavailable", `Web provider '${id}' is ${state ? "disabled" : "not configured"}.`);
    const entry = this.entries.get(id);
    if (!entry || entry.runs.closed) throw new WebError("provider_unavailable", `Web provider type '${id}' is unavailable.`);
    return { state, entry };
  }
  /** 在 entry.runs 作用域内取用凭据、创建实例并执行调用；所有步骤共用同一取消信号。 */
  private call<T>(id: string, signal: AbortSignal, work: (instance: WebProviderInstance, scope: AbortSignal) => Promise<T>): Promise<T> {
    const { entry } = this.captureEntry(id);
    return entry.runs.start(async scope => {
      scope.throwIfAborted();
      const credential = entry.info.credential?.kind === "api_key" ? await this.connections.credential(id) : null;
      scope.throwIfAborted();
      const baseUrl = entry.definition.defaultBaseUrl.replace(/\/+$/u, "");
      const instance = entry.definition.create({ baseUrl, credential });
      return work(instance, scope);
    }, { signal, affectsHistory: false }).done;
  }
  private parseResponse(raw: unknown, maxCharacters?: number) {
    const parsed = webResponseSchema.safeParse(raw);
    if (!parsed.success) throw new WebError("protocol", `Invalid web provider result: ${parsed.error.message}`);
    return limitWebBody(parsed.data, maxCharacters);
  }
  async resolve(id: string, options: { signal: AbortSignal }): Promise<WebProviderInstance> {
    const { entry } = this.captureEntry(id);
    if (!entry.info.fetch && !entry.info.search)
      throw new WebError("unsupported", "This provider declares no operations.");
    // 在 entry.runs 作用域内取用凭据与创建实例；后续调用复用该实例的闭包状态。
    const instance = await entry.runs.start(async scope => {
      scope.throwIfAborted();
      const credential = entry.info.credential?.kind === "api_key" ? await this.connections.credential(id) : null;
      scope.throwIfAborted();
      const baseUrl = entry.definition.defaultBaseUrl.replace(/\/+$/u, "");
      return entry.definition.create({ baseUrl, credential });
    }, { signal: options.signal, affectsHistory: false }).done;
    const decode = (raw: unknown) => this.parseResponse(raw);
    const guard = <T>(work: (scope: AbortSignal) => Promise<T>, signal: AbortSignal) =>
      entry.runs.start(async scope => {
        scope.throwIfAborted();
        return work(scope);
      }, { signal, affectsHistory: false }).done;
    const result: WebProviderInstance = {};
    if (entry.info.search && instance.search) result.search = (req, { signal }) =>
      guard(scope => instance.search!(webSearchRequestSchema.parse(req), { signal: scope }), signal).then(decode);
    if (entry.info.fetch && instance.fetch) result.fetch = async (req, { signal }) => {
      const input = webFetchRequestSchema.parse(req);
      return guard(scope => instance.fetch!(input, { signal: scope }), signal)
        .then(raw => this.parseResponse(raw, input.maxCharacters));
    };
    return result;
  }
  async search(request: WebSearchRequest, options: { signal: AbortSignal }) {
    const states = this.list(), types = this.types();
    const id = states.find(s => s.enabled && types.some(t => t.id === s.id && t.search))?.id;
    if (!id) throw new WebError("provider_unavailable", "No enabled search provider configured. Add a web provider in Settings → Providers → Web providers.");
    const entry = this.entries.get(id)!;
    const parsed = webSearchRequestSchema.parse(request);
    const raw = await this.call(id, options.signal, (inst, scope) => inst.search!(parsed, { signal: scope }));
    return { ...this.parseResponse(raw), query: parsed.query, provider: entry.info.id };
  }
  async fetch(request: WebFetchRequest, options: { signal: AbortSignal }) {
    const input = webFetchRequestSchema.parse(request);
    const id = matchWebProvider(this.list(), this.types(), input.url);
    if (id === null) throw new WebError("provider_unavailable", "No enabled web provider matches this URL. Configure a web provider in Settings → Providers → Web providers.");
    const entry = this.entries.get(id)!;
    const raw = await this.call(id, options.signal, (inst, scope) => inst.fetch!(input, { signal: scope }));
    return { ...this.parseResponse(raw, input.maxCharacters), requestedUrl: input.url, provider: entry.info.id };
  }
}
