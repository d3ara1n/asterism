import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { CredentialVault } from "../configuration/credentials.ts";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import { PluginApiError, type PluginConfig, type PluginSecrets } from "./contract.ts";

/** 宿主托管目录名；插件目录其余部分归插件自由写入。 */
export const managedDirectory = ".atelier";
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
 * 单个插件的托管存储：`<extensions>/<pluginId>/` 与其中的 `.atelier/`。
 * 目录、配置、凭据引用与数据库均懒创建；凭据明文只在 vault 中。
 */
export class PluginStorage {
  readonly dir: string;
  private readonly managed: string;
  private database: DatabaseSync | null = null;
  constructor(extensionsDirectory: string, pluginId: string, private readonly vault: CredentialVault | null,
    private readonly warn: (message: string, error?: unknown) => void) {
    this.dir = join(extensionsDirectory, pluginId);
    this.managed = join(this.dir, managedDirectory);
  }
  private ensure(): string {
    mkdirSync(this.managed, { recursive: true, mode: 0o700 });
    return this.managed;
  }

  config<T extends Json>(schema: z.ZodType<T>, defaults: T): PluginConfig<T> {
    const file = () => join(this.ensure(), "config.json");
    const fallback = () => schema.parse(defaults);
    return {
      get: () => {
        let raw: unknown;
        try { raw = readJson(file()); } catch (error) { this.warn("Plugin configuration is unreadable; defaults are used.", error); return fallback(); }
        if (raw === undefined) return fallback();
        const parsed = schema.safeParse(raw);
        if (parsed.success) return parsed.data;
        this.warn("Plugin configuration does not match its schema; defaults are used.");
        return fallback();
      },
      set: value => {
        const parsed = schema.safeParse(value);
        if (!parsed.success) throw new PluginApiError("invalid_argument", "The configuration does not match the plugin's schema.");
        writeJson(file(), jsonSchema.parse(parsed.data));
      },
    };
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

  /** 插件专属 SQLite，与宿主数据库为独立文件；首次访问时打开。 */
  db(): DatabaseSync {
    this.database ??= new DatabaseSync(join(this.ensure(), "db.sqlite"));
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
