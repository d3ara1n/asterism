import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { applicationStorage } from "../shared/application.ts";
import { agentOverridesSchema, canEditModelProviderField, modelReference, modelRoleOverridesSchema, modelSchema, modelProviderInputSchema,
  type AgentOverrides, type ModelRoleOverrides, type ModelProviderInput, type ProviderModel } from "../shared/configuration.ts";
import { modelCostSchema, webProviderStateSchema, type WebProviderState } from "@atelier/sdk/contracts";
import { configurationIdSchema } from "@atelier/builtin-api/contracts";
import { defaultAgents, defaultRoles } from "./defaults.ts";
import { ConfigurationError } from "./errors.ts";
import { normalizeOverrides, resolveAgentConfiguration, resolveRoleConfiguration } from "./layers.ts";
import { migrateModelCost } from "./model-cost-migration.ts";
import { providerEditingMessages } from "../shared/provider-editing-messages.ts";

const identity = { id: configurationIdSchema };
const storedProviderSchema = modelProviderInputSchema.extend({ credentialRef: z.string().uuid().nullable() }).strip();
const storedWebProviderSchema = webProviderStateSchema.extend({ credentialRef: z.string().uuid().nullable() });
const storedRoleSchema = z.object({ ...identity, builtin: z.boolean(), overrides: modelRoleOverridesSchema });
const storedAgentSchema = z.object({ ...identity, builtin: z.boolean(), overrides: agentOverridesSchema });
const storedModelSchema = modelSchema.extend({ cost: z.preprocess(migrateModelCost, modelCostSchema.nullable().default(null)) }).strip();
/** 模型以 `<providerId>/<modelId>` 识别，其余以 id 识别。 */
const keyOf = (item: { id: string } | { providerId: string; modelId: string }): string => "id" in item ? item.id : modelReference(item);
const documentSchema = z.strictObject({
  version: z.literal(11),
  webProviders: z.array(storedWebProviderSchema),
  modelProviders: z.array(storedProviderSchema), models: z.array(storedModelSchema),
  roles: z.array(storedRoleSchema), agents: z.array(storedAgentSchema),
}).superRefine((document, context) => {
  for (const key of ["modelProviders", "webProviders", "models", "roles", "agents"] as const) {
    const ids = new Set<string>();
    document[key].forEach((item, index) => {
      const key_ = keyOf(item);
      if (ids.has(key_)) context.addIssue({ code: "custom", message: "Duplicate configuration identity.", path: [key, index, "id"] });
      ids.add(key_);
    });
  }
});

type ConfigurationDocument = z.infer<typeof documentSchema>;
export type StoredModelProvider = z.infer<typeof storedProviderSchema>;
const collections = { modelProvider: "modelProviders", webProvider: "webProviders", model: "models", role: "roles", agent: "agents" } as const;
export type ConfigurationKind = keyof typeof collections;
type Entry = { [K in ConfigurationKind]: ConfigurationDocument[(typeof collections)[K]][number] };
type ConfigurationSave =
  | { kind: "webProvider"; id: string; value: WebProviderState; credentialRef: string | null }
  | { kind: "modelProvider"; id: string | null; value: ModelProviderInput; credentialRef: string | null }
  | { kind: "model"; id: string | null; value: ProviderModel }
  | { kind: "role"; id: string | null; value: ModelRoleOverrides & { id: string } }
  | { kind: "agent"; id: string | null; value: AgentOverrides & { id: string } };

function validate(raw: unknown): ConfigurationDocument {
  const document = documentSchema.parse(raw);
  for (const role of document.roles) {
    resolveRoleConfiguration(role);
  }
  for (const agent of document.agents) {
    resolveAgentConfiguration(agent);
  }
  return document;
}

/** 以旧身份定位并替换；新身份与其他项冲突时拒绝。 */
function upsert<T extends { id: string } | { providerId: string; modelId: string }>(items: T[], previous: string | null, item: T): void {
  const index = previous === null ? -1 : items.findIndex(value => keyOf(value) === previous);
  if (items.some((value, i) => i !== index && keyOf(value) === keyOf(item))) throw new ConfigurationError("conflict", "This ID is already used. Choose another.");
  if (index < 0) items.push(item);
  else items[index] = item;
}

/** 单实例内由配置模块独占；保存成功后才替换内存视图，调用方不接触文件格式。 */
export class ConfigurationStore {
  private readonly path: string;
  private document: ConfigurationDocument;
  constructor(root: string) {
    mkdirSync(root, { recursive: true });
    this.path = join(root, applicationStorage.configurationFile);
    let content: string;
    try { content = readFileSync(this.path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new ConfigurationError("unavailable", "The application configuration could not be read.");
      // 只有文件不存在才初始化；已有文件中的删除状态不会重新播种。
      this.document = {
        version: 11, modelProviders: [], webProviders: [], models: [],
        roles: defaultRoles.map(({ id, builtin }) => ({ id, builtin, overrides: {} })),
        agents: defaultAgents.map(({ id, builtin }) => ({ id, builtin, overrides: {} })),
      };
      this.commit(this.document);
      return;
    }
    try { this.document = validate(JSON.parse(content)); }
    catch { throw new ConfigurationError("unavailable", "The application configuration is invalid or unsupported. Back up and repair configuration.json before restarting."); }
  }
  list<K extends ConfigurationKind>(kind: K): Entry[K][] {
    return structuredClone(this.document[collections[kind]]) as Entry[K][];
  }
  get<K extends ConfigurationKind>(kind: K, id: string): Entry[K] | null {
    const item = (this.document[collections[kind]] as (Entry[K])[]).find(item => keyOf(item as never) === id);
    return item ? structuredClone(item) as Entry[K] : null;
  }
  save(input: ConfigurationSave): void {
    this.validateEdit(input);
    const next = structuredClone(this.document);
    const { id } = input;
    switch (input.kind) {
      case "webProvider": upsert(next.webProviders, input.id, { ...input.value, credentialRef: input.credentialRef }); break;
      case "modelProvider":
        upsert(next.modelProviders, id, { ...input.value, credentialRef: input.credentialRef });
        // 提供商拥有其模型：改名时模型随之迁移；角色等引用不改写。
        if (id !== null && id !== input.value.id) for (const model of next.models) if (model.providerId === id) model.providerId = input.value.id;
        break;
      case "model": upsert(next.models, id, input.value); break;
      case "role": case "agent": {
        const { id: nextId, ...overrides } = input.value;
        const builtin = id !== null && (this.get(input.kind, id)?.builtin ?? false);
        if (builtin && id !== nextId) throw new ConfigurationError("invalid_request", "Built-in configuration IDs are fixed.");
        upsert(next[collections[input.kind]], id, { id: nextId, builtin, overrides: normalizeOverrides(overrides) });
        break;
      }
    }
    this.commit(next);
  }
  /** 编辑限制随连接保存；比较已保存值，不依赖当前预设目录。 */
  private validateEdit(input: ConfigurationSave): void {
    const reject = () => { throw new ConfigurationError("invalid_request",
      "Fixed connection settings cannot be changed.", providerEditingMessages.fixed); };
    if (input.kind === "modelProvider" && input.id !== null) {
      const previous = this.get("modelProvider", input.id);
      if (!previous) return;
      const fixed = previous.fixedFields ?? [];
      const nextFixed = input.value.fixedFields ?? [];
      if (fixed.length !== nextFixed.length || fixed.some(field => !nextFixed.includes(field))) reject();
      for (const field of fixed) if (!isDeepStrictEqual(previous[field], input.value[field])) reject();
    }
    if (input.kind === "model") {
      const provider = this.get("modelProvider", input.value.providerId);
      if (!provider || canEditModelProviderField(provider, "compatibility")) return;
      const previous = input.id === null ? null : this.get("model", input.id);
      const compatibility = previous?.providerId === provider.id ? previous.compatibility : [];
      if (!isDeepStrictEqual(compatibility, input.value.compatibility)) reject();
    }
  }
  remove(kind: ConfigurationKind, id: string): { credentialRef: string | null } {
    const old = this.get(kind, id);
    if (!old) throw new ConfigurationError("not_found", "This configuration no longer exists.");
    if (kind === "role" && this.get("role", id)?.builtin) throw new ConfigurationError("invalid_request", "Built-in model roles cannot be deleted.");
    const next = structuredClone(this.document);
    // 提供商与它拥有的模型在同一次保存中删除，不修改角色或会话的选择。
    switch (kind) {
      case "webProvider": next.webProviders = next.webProviders.filter(item => item.id !== id); break;
      case "modelProvider": next.modelProviders = next.modelProviders.filter(item => item.id !== id); next.models = next.models.filter(item => item.providerId !== id); break;
      case "model": next.models = next.models.filter(item => modelReference(item) !== id); break;
      case "role": next.roles = next.roles.filter(item => item.id !== id); break;
      case "agent": next.agents = next.agents.filter(item => item.id !== id); break;
    }
    this.commit(next);
    return { credentialRef: "credentialRef" in old ? old.credentialRef : null };
  }
  /** 一次保存全部选择；已有模型保留原值，重试不会覆盖用户配置。 */
  addModels(models: ProviderModel[]): void {
    const next = structuredClone(this.document);
    const existing = new Set(next.models.map(modelReference));
    for (const model of models) if (!existing.has(modelReference(model))) {
      next.models.push(model);
      existing.add(modelReference(model));
    }
    if (next.models.length !== this.document.models.length) this.commit(next);
  }
  private commit(raw: ConfigurationDocument): void {
    let next: ConfigurationDocument;
    // 写入前统一校验结构与生效配置；失败时不改变当前文档。
    try { next = validate(raw); }
    catch (error) {
      if (error instanceof ConfigurationError) throw error;
      throw new ConfigurationError("invalid_request", "Invalid configuration. Check the entered values.");
    }
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600, flush: true });
      renameSync(temporary, this.path);
    } catch { throw new ConfigurationError("unavailable", "The application configuration could not be saved."); }
    finally {
      try { rmSync(temporary, { force: true }); }
      catch { console.error("Temporary configuration cleanup failed."); }
    }
    this.document = next;
  }
}
