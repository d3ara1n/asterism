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
// 测试用可逆保护：只验证命名空间隔离，不涉及系统加密。
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

describe("插件托管存储", () => {
  it("配置声明复用同一 schema 和默认值，默认值与界面快照不反向修改声明", () => {
    const { open } = setup();
    const storage = open("acme.settings");
    const schema = z.strictObject({ limit: z.number().int().min(1) }).meta({ title: "Limits" });
    const defaults = { limit: 5 };
    const config = storage.config(schema, defaults);
    defaults.limit = 99;
    expect(config.get()).toEqual({ limit: 5 });
    expect(storage.config(schema, { limit: 5 }).get()).toEqual({ limit: 5 });
    expect(() => storage.config(schema, { limit: 6 })).toThrow(/one configuration/);
    expect(() => storage.config(z.strictObject({ limit: z.number() }), { limit: 5 })).toThrow(/same schema/);
    const snapshot = storage.configuration("acme.settings")!;
    expect(snapshot).toMatchObject({ id: "acme.settings", schema: { title: "Limits" }, defaults: { limit: 5 }, value: { limit: 5 }, status: "defaults" });
    (snapshot.defaults as { limit: number }).limit = 123;
    expect(storage.configuration("acme.settings")?.defaults).toEqual({ limit: 5 });
  });
  it("界面读取保留损坏文件，保存使用原始 Zod refinement，恢复只清理配置文件", () => {
    const { open } = setup();
    const storage = open("acme.settings");
    const schema = z.strictObject({ lower: z.number(), upper: z.number() })
      .refine(value => value.lower <= value.upper, { path: ["upper"], message: "Upper must not be below lower." });
    const config = storage.config(schema, { lower: 1, upper: 2 });
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
  it("配置不合 schema 时回退默认值并告警，写入非法值被拒绝", () => {
    const { open, warnings } = setup();
    const storage = open("acme.a");
    const config = storage.config(z.strictObject({ limit: z.number().int() }), { limit: 5 });
    expect(config.get()).toEqual({ limit: 5 });
    writeFileSync(join(storage.dir, managedDirectory, "config.json"), JSON.stringify({ limit: "many" }));
    expect(config.get()).toEqual({ limit: 5 });
    expect(warnings).toHaveLength(1);
    expect(() => config.set({ limit: 1.5 })).toThrow(expect.objectContaining({ code: "invalid_argument" }));
    config.set({ limit: 9 });
    expect(config.get()).toEqual({ limit: 9 });
  });

  it("两个插件的同名凭据互不可见，插件目录不存明文", async () => {
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

  it("数据库是插件托管目录内的独立文件", () => {
    const { root, open } = setup();
    const storage = open("acme.a");
    storage.db().exec("CREATE TABLE t (x)");
    expect(existsSync(join(storage.dir, managedDirectory, "db.sqlite"))).toBe(true);
    expect(existsSync(join(root, "db"))).toBe(false);
  });
});
