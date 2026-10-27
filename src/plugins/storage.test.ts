import { defineConfig } from "@asterism/sdk/contracts";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { CredentialVault } from "../configuration/credentials.ts";
import { PluginStorage, managedDirectory } from "./storage.ts";

const roots: string[] = [];
const storages: PluginStorage[] = [];
afterEach(() => {
  for (const storage of storages.splice(0)) storage.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
// Reversible test protection verifies namespace isolation only, without system encryption.
const protector = {
  available: async () => true,
  encrypt: async (value: string) => Buffer.from(value).toString("base64"),
  decrypt: async (value: string) => Buffer.from(value, "base64").toString(),
};
function setup() {
  const root = mkdtempSync(join(tmpdir(), "core-plugin-")); roots.push(root);
  const vault = new CredentialVault(root, protector);
  const warnings: string[] = [];
  const open = (id: string) => {
    const storage = new PluginStorage(join(root, "extensions"), id, vault, message => warnings.push(message));
    storages.push(storage);
    return storage;
  };
  return { root, open, warnings };
}

describe("Plugin managed storage", () => {
  it("one configuration contract per plugin; defaults and UI snapshots do not mutate declarations", () => {
    const { open } = setup();
    const storage = open("acme.settings");
    const contract = defineConfig("acme.settings", z.strictObject({ limit: z.number().int().min(1) }).meta({ title: "Limits" }), { limit: 5 });
    const config = storage.config(contract);
    expect(config.get()).toEqual({ limit: 5 });
    expect(storage.config(contract).get()).toEqual({ limit: 5 });
    expect(() => storage.config(defineConfig("acme.settings", z.strictObject({ limit: z.number() }), { limit: 5 }))).toThrow();
    const snapshot = storage.configuration("acme.settings")!;
    expect(snapshot).toMatchObject({ id: "acme.settings", defaults: { limit: 5 }, value: { limit: 5 }, status: "defaults" });
    expect(existsSync(join(storage.dir, managedDirectory, "db.sqlite"))).toBe(false);
    (snapshot.defaults as { limit: number }).limit = 123;
    expect(storage.configuration("acme.settings")?.defaults).toEqual({ limit: 5 });
  });
  it("UI reads preserve corrupt files, saves use original Zod refinements, and restoration cleans configuration files only", () => {
    const { open } = setup();
    const storage = open("acme.settings");
    const schema = z.strictObject({ lower: z.number(), upper: z.number() })
      .refine(value => value.lower <= value.upper, { path: ["upper"], message: "Upper must not be below lower." });
    const config = storage.config(defineConfig("acme.settings", schema, { lower: 1, upper: 2 }));
    config.get();
    const file = join(storage.dir, managedDirectory, "config.json");
    writeFileSync(file, "{broken");
    expect(storage.configuration("acme.settings")).toMatchObject({ status: "invalid", value: { lower: 1, upper: 2 } });
    expect(readFileSync(file, "utf8")).toBe("{broken");
    expect(() => storage.saveConfiguration({ lower: 4, upper: 3 })).toThrow(/configuration.upper/);
    expect(readFileSync(file, "utf8")).toBe("{broken");
    storage.saveConfiguration({ lower: 3, upper: 4 });
    expect(config.get()).toEqual({ lower: 3, upper: 4 });
    const db = storage.db(); db.exec("CREATE TABLE marker (value TEXT)");
    storage.resetConfiguration();
    expect(existsSync(file)).toBe(false);
    expect(existsSync(join(storage.dir, managedDirectory, "db.sqlite"))).toBe(true);
    expect(config.get()).toEqual({ lower: 1, upper: 2 });
  });
  it("schema-invalid configuration falls back to defaults with warnings, updates use current values, and invalid values are rejected", () => {
    const { open, warnings } = setup();
    const storage = open("acme.a");
    const config = storage.config(defineConfig("acme.a", z.strictObject({ limit: z.number().int() }), { limit: 5 }));
    expect(config.get()).toEqual({ limit: 5 });
    writeFileSync(join(storage.dir, managedDirectory, "config.json"), JSON.stringify({ limit: "many" }));
    expect(config.get()).toEqual({ limit: 5 });
    expect(warnings.length).toBeGreaterThan(0);
    expect(() => config.update(() => ({ limit: 1.5 }))).toThrow(expect.objectContaining({ code: "invalid_argument" }));
    config.update(value => ({ limit: value.limit + 4 }));
    expect(config.get()).toEqual({ limit: 9 });
    config.update(value => ({ limit: value.limit + 1 }));
    expect(config.get()).toEqual({ limit: 10 });
  });
  it("settings saves, restoration, and backend updates notify subscribers and the host until unsubscribe", () => {
    const { open } = setup();
    const storage = open("acme.a");
    const hosted: number[] = [];
    storage.onChanged = () => { hosted.push((storage.configuration("acme.a")!.value as { limit: number }).limit); };
    const config = storage.config(defineConfig("acme.a", z.strictObject({ limit: z.number() }), { limit: 1 }));
    const seen: number[] = [];
    const stop = config.subscribe(value => seen.push(value.limit));
    storage.saveConfiguration({ limit: 2 });
    config.update(() => ({ limit: 3 }));
    storage.resetConfiguration();
    expect(seen).toEqual([2, 3, 1]);
    expect(hosted).toEqual([2, 3, 1]);
    stop();
    storage.saveConfiguration({ limit: 4 });
    expect(seen).toEqual([2, 3, 1]);
  });

  it("two plugins cannot see each other's same-name credentials and plugin directories contain no plaintext", async () => {
    const { open } = setup();
    const a = open("acme.a"), b = open("acme.b");
    await a.secrets.set("token", "secret-a");
    expect(await a.secrets.get("token")).toBe("secret-a");
    expect(await b.secrets.get("token")).toBeNull();
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(join(a.dir, managedDirectory, "secrets.json"), "utf8")).not.toContain("secret-a");
    await a.secrets.delete("token");
    expect(await a.secrets.get("token")).toBeNull();
  });

  it("databases are independent files in plugin-managed directories", () => {
    const { root, open } = setup();
    const storage = open("acme.a");
    storage.db().exec("CREATE TABLE t (x)");
    expect(existsSync(join(storage.dir, managedDirectory, "db.sqlite"))).toBe(true);
    expect(existsSync(join(root, "db"))).toBe(false);
  });
});
