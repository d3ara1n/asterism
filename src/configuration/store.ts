import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { applicationStorage } from "../shared/application.ts";
import { agentOverridesSchema, modelRoleOverridesSchema, modelSchema, providerInputSchema,
  type AgentOverrides, type ModelRoleOverrides, type ProviderInput, type ProviderModel } from "../shared/configuration.ts";
import { defaultAgents, defaultRoles } from "./defaults.ts";
import { ConfigurationError } from "./errors.ts";
import { normalizeOverrides, resolveAgentConfiguration, resolveRoleConfiguration } from "./layers.ts";

const identity = { id: z.string().min(1).max(160), revision: z.number().int().positive() };
const storedProviderSchema = providerInputSchema.extend({ ...identity, credentialRef: z.string().uuid().nullable() });
const storedRoleSchema = z.strictObject({ ...identity, builtin: z.boolean(), overrides: modelRoleOverridesSchema });
const storedAgentSchema = z.strictObject({ ...identity, builtin: z.boolean(), overrides: agentOverridesSchema });
const documentSchema = z.strictObject({
  version: z.literal(1),
  providers: z.array(storedProviderSchema), models: z.array(modelSchema),
  roles: z.array(storedRoleSchema), agents: z.array(storedAgentSchema),
}).superRefine((document, context) => {
  for (const key of ["providers", "models", "roles", "agents"] as const) {
    const ids = new Set<string>();
    document[key].forEach((item, index) => {
      if (ids.has(item.id)) context.addIssue({ code: "custom", message: "Duplicate configuration identity.", path: [key, index, "id"] });
      ids.add(item.id);
    });
  }
});

type ConfigurationDocument = z.infer<typeof documentSchema>;
export type StoredProvider = z.infer<typeof storedProviderSchema>;
const collections = { provider: "providers", model: "models", role: "roles", agent: "agents" } as const;
export type ConfigurationKind = keyof typeof collections;
type Entry = { [K in ConfigurationKind]: ConfigurationDocument[(typeof collections)[K]][number] };
type ConfigurationSave =
  | { kind: "provider"; id: string; value: ProviderInput; credentialRef: string | null }
  | { kind: "model"; id: string; value: Omit<ProviderModel, "id" | "revision"> }
  | { kind: "role"; id: string; value: ModelRoleOverrides }
  | { kind: "agent"; id: string; value: AgentOverrides };

function validate(raw: unknown): ConfigurationDocument {
  const document = documentSchema.parse(raw);
  for (const role of document.roles) {
    if (!role.builtin && !role.overrides.name?.trim()) throw new ConfigurationError("invalid_request", "Custom configurations require a name.");
    resolveRoleConfiguration(role);
  }
  for (const agent of document.agents) {
    if (!agent.builtin && !agent.overrides.name?.trim()) throw new ConfigurationError("invalid_request", "Custom configurations require a name.");
    resolveAgentConfiguration(agent);
  }
  return document;
}

function upsert<T extends { id: string }>(items: T[], item: T): void {
  const index = items.findIndex(value => value.id === item.id);
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
        version: 1, providers: [], models: [],
        roles: defaultRoles.map(({ id, builtin }) => ({ id, builtin, revision: 1, overrides: {} })),
        agents: defaultAgents.map(({ id, builtin }) => ({ id, builtin, revision: 1, overrides: {} })),
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
    const item = this.document[collections[kind]].find(item => item.id === id);
    return item ? structuredClone(item) as Entry[K] : null;
  }
  save(input: ConfigurationSave): void {
    const next = structuredClone(this.document);
    const { id } = input;
    const revision = (this.get(input.kind, id)?.revision ?? 0) + 1;
    switch (input.kind) {
      case "provider": upsert(next.providers, { ...input.value, id, revision, credentialRef: input.credentialRef }); break;
      case "model": upsert(next.models, { ...input.value, id, revision }); break;
      case "role": upsert(next.roles, { id, revision, builtin: this.get("role", id)?.builtin ?? false, overrides: normalizeOverrides(input.value) }); break;
      case "agent": upsert(next.agents, { id, revision, builtin: this.get("agent", id)?.builtin ?? false, overrides: normalizeOverrides(input.value) }); break;
    }
    this.commit(next);
  }
  remove(kind: ConfigurationKind, id: string): { credentialRef: string | null } {
    const old = this.get(kind, id);
    if (!old) throw new ConfigurationError("not_found", "This configuration no longer exists.");
    if (kind === "role" && this.get("role", id)?.builtin) throw new ConfigurationError("invalid_request", "Built-in model roles cannot be deleted.");
    const next = structuredClone(this.document);
    // 提供商与它拥有的模型在同一次保存中删除，不修改角色或会话的选择。
    switch (kind) {
      case "provider": next.providers = next.providers.filter(item => item.id !== id); next.models = next.models.filter(item => item.providerId !== id); break;
      case "model": next.models = next.models.filter(item => item.id !== id); break;
      case "role": next.roles = next.roles.filter(item => item.id !== id); break;
      case "agent": next.agents = next.agents.filter(item => item.id !== id); break;
    }
    this.commit(next);
    return { credentialRef: "credentialRef" in old ? old.credentialRef : null };
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
