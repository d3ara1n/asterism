import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { applicationStorage } from "../shared/application.ts";
import { canEditModelProviderField, modelReference, modelSchema, modelProviderInputSchema, sessionEntrySelectionSchema,
  type ModelProviderInput, type ProviderModel } from "../shared/configuration.ts";
import { mcpSettingsSchema, defaultMcpSettings, shellSettingsSchema, defaultShellSettings, modelCostSchema, webProviderStateSchema, type WebProviderState } from "@asterism-app/sdk/contracts";
import { ConfigurationError } from "./errors.ts";
import { providerEditingMessages } from "../shared/provider-editing-messages.ts";
import { jsonStorage } from "../storage/migrations.ts";

/** Global configuration format; increment on changes and append an n → n+1 migration to `configurationStorage`. */
export const configurationVersion = 12;
const storedProviderSchema = modelProviderInputSchema.extend({ credentialRef: z.string().uuid().nullable() }).strip();
const storedWebProviderSchema = webProviderStateSchema.extend({ credentialRef: z.string().uuid().nullable() });
const storedModelSchema = modelSchema.extend({ cost: modelCostSchema.nullable().default(null) }).strip();
/** Models use `<providerId>/<modelId>` identities; other entries use id. */
const keyOf = (item: { id: string } | { providerId: string; modelId: string }): string => "id" in item ? item.id : modelReference(item);
const documentSchema = z.strictObject({
  version: z.literal(configurationVersion),
  mcp: mcpSettingsSchema,
  mcpCredentialRefs: z.record(z.string(), z.string().uuid()),
  shell: shellSettingsSchema,
  webProviders: z.array(storedWebProviderSchema),
  modelProviders: z.array(storedProviderSchema), models: z.array(storedModelSchema),
  sessionEntry: sessionEntrySelectionSchema.nullable(),
}).superRefine((document, context) => {
  for (const key of ["modelProviders", "webProviders", "models"] as const) {
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
const collections = { modelProvider: "modelProviders", webProvider: "webProviders", model: "models" } as const;
export type ConfigurationKind = keyof typeof collections;
type Entry = { [K in ConfigurationKind]: ConfigurationDocument[(typeof collections)[K]][number] };
type ConfigurationSave =
  | { kind: "webProvider"; id: string; value: WebProviderState; credentialRef: string | null }
  | { kind: "modelProvider"; id: string | null; value: ModelProviderInput; credentialRef: string | null }
  | { kind: "model"; id: string | null; value: ProviderModel };

function initialConfiguration(): ConfigurationDocument {
  return { version: configurationVersion, mcp: structuredClone(defaultMcpSettings), mcpCredentialRefs: {},
    shell: structuredClone(defaultShellSettings), modelProviders: [], webProviders: [], models: [], sessionEntry: null };
}
/** Append conversions for released formats here; business reads and writes always consume the current document. */
export function configurationStorage(root: string) {
  return jsonStorage({ id: "configuration", file: join(root, applicationStorage.configurationFile), version: configurationVersion, migrations: {} });
}

/** Locate by old identity and replace; reject new identities that conflict with other entries. */
function upsert<T extends { id: string } | { providerId: string; modelId: string }>(items: T[], previous: string | null, item: T): void {
  const index = previous === null ? -1 : items.findIndex(value => keyOf(value) === previous);
  if (items.some((value, i) => i !== index && keyOf(value) === keyOf(item))) throw new ConfigurationError("conflict", "This ID is already used. Choose another.");
  if (index < 0) items.push(item);
  else items[index] = item;
}

/** Exclusively owned by configuration within one instance; replace the in-memory view only after saving succeeds. Callers do not access the file format. */
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
      // Initialize only when the file is absent; deletions in existing files are not reseeded.
      this.document = initialConfiguration();
      this.commit(this.document);
      return;
    }
    try { this.document = documentSchema.parse(JSON.parse(content)); }
    catch { throw new ConfigurationError("unavailable", "The application configuration is invalid or unsupported. Back up and repair configuration.json before restarting."); }
  }
  mcp() { return structuredClone(this.document.mcp); }
  mcpCredentialReference(key: string) { return this.document.mcpCredentialRefs[key] ?? null; }
  setMcpCredentialReference(key: string, reference: string | null) {
    const refs = { ...this.document.mcpCredentialRefs };
    if (reference === null) delete refs[key]; else refs[key] = reference;
    this.commit({ ...this.document, mcpCredentialRefs: refs });
  }
  setMcp(value: z.infer<typeof mcpSettingsSchema>) { this.commit({ ...this.document, mcp: value }); }
  shell() { return structuredClone(this.document.shell); }
  setShell(value: z.infer<typeof shellSettingsSchema>) { this.commit({ ...this.document, shell: value }); }
  sessionEntry() { return structuredClone(this.document.sessionEntry); }
  selectSessionEntry(value: z.infer<typeof sessionEntrySelectionSchema>) { this.commit({ ...this.document, sessionEntry: value }); }
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
        // Providers own their models: renaming moves models with them without rewriting saved model references.
        if (id !== null && id !== input.value.id) for (const model of next.models) if (model.providerId === id) model.providerId = input.value.id;
        break;
      case "model": upsert(next.models, id, input.value); break;

    }
    this.commit(next);
  }
  reorderWebProviders(ids: string[]): void {
    const providers = new Map(this.document.webProviders.map(provider => [provider.id, provider]));
    if (ids.length !== providers.size || new Set(ids).size !== ids.length || ids.some(id => !providers.has(id)))
      throw new ConfigurationError("invalid_request", "The order must contain each configured web provider exactly once.");
    const next = structuredClone(this.document);
    next.webProviders = ids.map(id => providers.get(id)!);
    this.commit(next);
  }
  /** Editing restrictions persist with the connection; compare saved values independently of the current preset catalog. */
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
    const next = structuredClone(this.document);
    // Delete the provider and its models in one save without changing saved session selections.
    switch (kind) {
      case "webProvider": next.webProviders = next.webProviders.filter(item => item.id !== id); break;
      case "modelProvider": next.modelProviders = next.modelProviders.filter(item => item.id !== id); next.models = next.models.filter(item => item.providerId !== id); break;
      case "model": next.models = next.models.filter(item => modelReference(item) !== id); break;
    }
    this.commit(next);
    return { credentialRef: "credentialRef" in old ? old.credentialRef : null };
  }
  /** Save all selections together; existing models retain their values and retries do not overwrite user configuration. */
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
    // Validate the document before writing; failure leaves the current document unchanged.
    try { next = documentSchema.parse(raw); }
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
