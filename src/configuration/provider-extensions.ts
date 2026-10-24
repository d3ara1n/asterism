import { modelProviderPresetSchema, usageProviderInfoSchema, usageItemsSchema, type ModelProviderPreset, type ModelProviderPresetContribution } from "@atelier/sdk/contracts";
import { UsageQueryError, type UsageProvider } from "@atelier/sdk/runtime";
import type { RunGroup } from "../plugins/lifecycle.ts";
import { defineProviderPresets } from "../shared/provider-presets.ts";
import { synchronous } from "../plugins/synchronous.ts";

interface Layer { owner: string; changes: readonly ModelProviderPresetContribution[] }
/** 插件贡献的目录：按装配次序覆盖预设；查询身份唯一，不以覆盖预设隐式替换实现。 */
export class ModelProviderExtensions {
  private layers: Layer[] = [];
  private queries = new Map<string, { owner: string; provider: UsageProvider; runs: RunGroup }>();
  private listeners = new Set<() => void>();
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private changed() { for (const listener of this.listeners) listener(); }
  private resolve(layers = this.layers) {
    const presets = new Map<string, ModelProviderPreset>();
    for (const layer of layers) for (const change of layer.changes) {
      if (change.type === "add") {
        if (presets.has(change.preset.id)) throw new Error(`Duplicate provider preset: ${change.preset.id}`);
        presets.set(change.preset.id, structuredClone(change.preset));
      } else {
        const previous = presets.get(change.id);
        if (!previous) throw new Error(`Unknown provider preset: ${change.id}`);
        presets.set(change.id, { ...previous, ...structuredClone(change.patch), id: previous.id,
          connection: { ...previous.connection, ...structuredClone(change.patch.connection) } });
      }
    }
    return defineProviderPresets([...presets.values()]);
  }
  presets() { return this.resolve(); }
  usageProviders() { return [...this.queries.values()].map(({ owner, provider }) =>
    usageProviderInfoSchema.parse({ id: provider.id, label: provider.label, owner, source: provider.source })); }
  declare(owner: string, providers: readonly UsageProvider[], changes: readonly ModelProviderPresetContribution[], runs: RunGroup, dependencies: readonly string[] = []): void {
    const ids = new Set(this.queries.keys());
    const normalizedProviders = providers.map((provider): UsageProvider => {
      const info = usageProviderInfoSchema.parse({ id: provider.id, label: provider.label, owner, source: provider.source });
      if (ids.has(info.id)) throw new Error(`Duplicate usage provider: ${info.id}`);
      ids.add(info.id);
      if (provider.source === "headers") {
        if (typeof provider.parseHeaders !== "function") throw new Error(`Usage provider ${provider.id} has no header parser.`);
        return { id: info.id, label: info.label, source: "headers", parseHeaders: provider.parseHeaders.bind(provider) };
      }
      if (typeof provider.query !== "function") throw new Error(`Usage provider ${provider.id} has no query function.`);
      return { id: info.id, label: info.label, source: "query", query: provider.query.bind(provider) };
    });
    const normalizedChanges: ModelProviderPresetContribution[] = changes.map(change => {
      if (change.type === "add") return { type: "add", preset: modelProviderPresetSchema.parse(change.preset) };
      if (change.type === "patch") return { ...change, id: modelProviderPresetSchema.shape.id.parse(change.id) };
      throw new Error("Invalid provider preset contribution.");
    });
    // 修改其他插件新增的预设需要声明依赖，保证失败撤销和关闭次序可确定。
    for (const change of normalizedChanges) if (change.type === "patch") {
      const source = this.layers.find(layer => layer.changes.some(item => item.type === "add" && item.preset.id === change.id));
      if (source && source.owner !== owner && !dependencies.includes(source.owner))
        throw new Error(`Preset ${change.id} requires dependency ${source.owner}.`);
    }
    const layer = { owner, changes: structuredClone(normalizedChanges) };
    this.resolve([...this.layers, layer]);
    this.layers.push(layer);
    for (const provider of normalizedProviders) this.queries.set(provider.id, { owner, provider, runs });
    this.changed();
  }
  removeOwners(owners: readonly string[]): void {
    const removed = new Set(owners);
    this.layers = this.layers.filter(layer => !removed.has(layer.owner));
    for (const [id, query] of this.queries) if (removed.has(query.owner)) this.queries.delete(id);
    this.changed();
  }
  /** 句柄绑定登记实例；同 ID 重新登记不会复用旧句柄。 */
  get(id: string): UsageProvider | null {
    const entry = this.queries.get(id);
    if (!entry) return null;
    const check = () => {
      if (this.queries.get(id) !== entry || entry.runs.closed) throw new UsageQueryError("unavailable");
    };
    const validate = (raw: unknown) => {
      const result = usageItemsSchema.safeParse(raw);
      if (!result.success) throw new UsageQueryError("protocol");
      return result.data;
    };
    const provider = entry.provider;
    if (provider.source === "headers") return {
      id, label: structuredClone(provider.label), source: "headers",
      parseHeaders(context) {
        check();
        const result = synchronous(() => provider.parseHeaders(structuredClone(context)));
        return result === null ? null : validate(result);
      },
    };
    return { id, label: structuredClone(provider.label), source: "query", query: context => {
      check();
      const captured = { connection: structuredClone(context.connection), credential: context.credential };
      return entry.runs.start(async signal => {
        const result = await provider.query({ ...captured, signal });
        signal.throwIfAborted(); check();
        return validate(result);
      }, { signal: context.signal, affectsHistory: false }).done;
    } };
  }
}
