import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { CredentialVault } from "../configuration/credentials.ts";
import { jsonSchema, type Json, type ConfigContract } from "@asterism-app/sdk/contracts";
import { PluginApiError, type PluginConfig, type PluginSecrets, type PluginStorageDeclaration } from "@asterism-app/sdk/runtime";
import type { PluginConfiguration } from "../shared/plugin-configuration.ts";
import { encodePluginData } from "./data-encoding.ts";

/** Host-managed directory name; plugins may freely write elsewhere in their directories. */
export const managedDirectory = ".asterism";
const secretKey = z.string().min(1).max(160).regex(/^[A-Za-z0-9._-]+$/u);
const references = z.record(z.string(), z.string().uuid());

function readJson(file: string): unknown {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
function writeJson(file: string, value: unknown): void {
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flush: true });
  renameSync(temporary, file);
}

/**
 * Managed storage for one plugin: `<extensions>/<pluginId>/` and its `.asterism/` subdirectory.
 * Directories, configuration, credential references, and databases are created lazily; plaintext credentials exist only in the vault.
 */
export class PluginStorage {
  readonly dir: string;
  private readonly managed: string;
  private database: DatabaseSync | null = null;
  private settings: {
    source: object; defaults: Json;
    read(): { value: Json; status: PluginConfiguration["status"] };
    write(value: unknown): void;
    encode(value: Json): Json;
  } | null = null;
  constructor(extensionsDirectory: string, pluginId: string, private readonly vault: CredentialVault | null,
    private readonly warn: (message: string, error?: unknown) => void,
    private readonly declarations: readonly PluginStorageDeclaration[] = []) {
    this.dir = join(extensionsDirectory, pluginId);
    this.managed = join(this.dir, managedDirectory);
  }
  private ensure(): string {
    mkdirSync(this.managed, { recursive: true, mode: 0o700 });
    return this.managed;
  }

  /** One configuration contract per plugin; backend handles, settings pages, and renderer reads share values and change notifications. */
  config<T extends Json>(contract: ConfigContract<T>): PluginConfig<T> {
    if (this.settings && this.settings.source !== contract)
      throw new PluginApiError("invalid_argument", "A plugin has one configuration. Import the same contract.");
    if (!this.settings) {
      const declaration = this.declarations.find(item => item.kind === "json" && resolve(this.dir, item.path) === resolve(this.managed, "config.json"));
      const file = () => join(this.ensure(), "config.json");
      const fallback = () => structuredClone(contract.defaults);
      const encode = (value: unknown) => encodePluginData({ id: `${contract.plugin}.configuration`, schema: contract.schema }, value as T);
      const read = (): { value: Json; status: PluginConfiguration["status"] } => {
        let raw: unknown;
        try { raw = readJson(file()); }
        catch (error) {
          this.warn("Plugin configuration is unreadable; defaults are used.", error);
          return { value: fallback(), status: "invalid" };
        }
        if (raw === undefined) return { value: fallback(), status: "defaults" };
        if (declaration) {
          // Preparation aligns envelope versions; mismatches fall back to defaults just like corrupt bodies.
          const envelope = z.object({ version: z.literal(declaration.version), data: jsonSchema }).safeParse(raw);
          if (!envelope.success) {
            this.warn("Plugin configuration has an unexpected format version; defaults are used.");
            return { value: fallback(), status: "invalid" };
          }
          raw = envelope.data.data;
        }
        const parsed = contract.schema.safeParse(raw);
        if (parsed.success) return { value: jsonSchema.parse(parsed.data), status: "saved" };
        this.warn("Plugin configuration does not match its schema; defaults are used.");
        return { value: fallback(), status: "invalid" };
      };
      const write = (value: unknown) => {
        const data = encode(value);
        writeJson(file(), declaration ? { version: declaration.version, data } : data);
        this.changed();
      };
      this.settings = { source: contract, defaults: fallback(), read, write, encode };
    }
    const settings = this.settings!;
    return {
      get: () => settings.read().value as T,
      update: next => settings.write(next(settings.read().value as T)),
      subscribe: listener => {
        const notify = () => { try { listener(settings.read().value as T); } catch (error) { this.warn("A configuration listener failed.", error); } };
        this.listeners.add(notify);
        return () => { this.listeners.delete(notify); };
      },
    };
  }
  /** Host configuration observation: settings saves, default restoration, and backend updates broadcast here to renderer and backend subscribers. */
  onChanged: () => void = () => {};
  private readonly listeners = new Set<() => void>();
  private changed(): void {
    for (const listener of [...this.listeners]) listener();
    this.onChanged();
  }

  configuration(id: string): PluginConfiguration | null {
    if (!this.settings) return null;
    const { value, status } = this.settings.read();
    return { id, defaults: this.settings.encode(this.settings.defaults), value: this.settings.encode(value), status };
  }
  saveConfiguration(value: Json): void {
    if (!this.settings) throw new PluginApiError("not_found", "The plugin has no configuration.");
    this.settings.write(value);
  }
  resetConfiguration(): void {
    if (!this.settings) throw new PluginApiError("not_found", "The plugin has no configuration.");
    rmSync(join(this.managed, "config.json"), { force: true });
    this.changed();
  }

  readonly secrets: PluginSecrets = {
    get: async key => {
      const reference = this.references()[this.key(key)];
      if (!reference) return null;
      try { return await this.requireVault().read(reference); }
      catch { throw new PluginApiError("unavailable", "The stored secret cannot be decrypted."); }
    },
    set: async (key, value) => {
      const name = this.key(key);
      const vault = this.requireVault();
      if (!(await vault.available())) throw new PluginApiError("unavailable", "System credential protection is unavailable.");
      const map = this.references();
      const previous = map[name];
      map[name] = await vault.write(value);
      writeJson(join(this.ensure(), "secrets.json"), map);
      if (previous) this.discard(previous);
    },
    delete: async key => {
      const name = this.key(key);
      const map = this.references();
      const previous = map[name];
      if (!previous) return;
      delete map[name];
      writeJson(join(this.ensure(), "secrets.json"), map);
      this.discard(previous);
    },
  };

  /** Plugin-specific SQLite file separate from the host database, opened on first access. Declared formats stamp unstamped databases with the current version. */
  db(): DatabaseSync {
    if (!this.database) {
      const file = join(this.ensure(), "db.sqlite");
      const db = new DatabaseSync(file);
      const declaration = this.declarations.find(item => item.kind === "sqlite" && resolve(this.dir, item.path) === file);
      if (declaration && Number(db.prepare("PRAGMA user_version").get()!.user_version) === 0)
        db.exec(`PRAGMA user_version = ${declaration.version};`);
      this.database = db;
    }
    return this.database;
  }
  close(): void { this.database?.close(); this.database = null; }

  private key(key: string): string {
    if (!secretKey.safeParse(key).success) throw new PluginApiError("invalid_argument", "Secret keys use 1-160 letters, digits, '.', '_' or '-'.");
    return key;
  }
  private requireVault(): CredentialVault {
    if (!this.vault) throw new PluginApiError("unavailable", "Secret storage is unavailable.");
    return this.vault;
  }
  private references(): Record<string, string> {
    const parsed = references.safeParse(readJson(join(this.ensure(), "secrets.json")) ?? {});
    if (!parsed.success) throw new PluginApiError("unavailable", "The plugin secret index is corrupted.");
    return parsed.data;
  }
  private discard(reference: string): void {
    try { this.vault?.remove(reference); } catch (error) { this.warn("Unreferenced plugin secret cleanup failed.", error); }
  }
}
