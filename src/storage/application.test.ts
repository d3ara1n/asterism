import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { prepareApplicationData, pluginStorages } from "./application.ts";
import { prepareData } from "./preparation.ts";
import { readJson, writeJson } from "./files.ts";
import { PluginStorage } from "../plugins/storage.ts";
import { builtinStorage } from "@atelier/builtin/runtime";
import { BuiltinSettings } from "../../packages/builtin/src/settings/contract.ts";

const roots: string[] = [];
function root() { const directory = mkdtempSync(join(tmpdir(), "atelier-prepare-")); roots.push(directory); return directory; }
afterEach(() => { for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true }); });

// 主进程偏好与后台存储共用启动入口；第一次准备不应误报迁移，后续读取使用创建好的格式。
it("统一准备创建可读取的工作库、全局配置与版本化偏好", async () => {
  const directory = root();
  const result = await prepareApplicationData(directory, "0.1.0-prerelease.1");
  expect(result).toEqual({ ok: true, report: null });
  const database = new DatabaseSync(join(directory, "db", "workspace.sqlite"));
  try {
    expect(database.prepare("SELECT title FROM workspace").get()).toMatchObject({ title: "Personal workspace" });
    expect(database.prepare("SELECT count(*) AS total FROM sessions").get()).toMatchObject({ total: 0 });
  } finally { database.close(); }
  expect(readJson(join(directory, "configuration.json"))).toMatchObject({ version: 11, modelProviders: [] });
  expect(readJson(join(directory, "updates.json"))).toEqual({ version: 1, includePrerelease: true });
  expect(await prepareApplicationData(directory, "0.1.0")).toEqual({ ok: true, report: null });
  expect(readJson(join(directory, "updates.json"))).toEqual({ version: 1, includePrerelease: true });
});

// 新信封必须贯通插件正常读写，否则第一次保存后版本号会丢失而下次又触发迁移。
it("内置配置从旧文档迁移后，插件保存继续保留格式信封", async () => {
  const directory = root();
  const original = { ...BuiltinSettings.defaults, autoExpand: false };
  const file = join(directory, "extensions", "atelier.builtin", ".atelier", "config.json");
  writeJson(file, original);
  const declarations = builtinStorage.map(item => ({ ...item, path: "./.atelier/config.json" }));
  const result = await prepareData(directory, { version: "1", stores: pluginStorages(directory, "atelier.builtin", declarations) });
  expect(result.ok).toBe(true);
  const storage = new PluginStorage(join(directory, "extensions"), "atelier.builtin", null, () => {}, declarations);
  try {
    const configuration = storage.config(BuiltinSettings);
    expect(configuration.get().autoExpand).toBe(false);
    configuration.update(value => ({ ...value, autoCollapse: false }));
    expect(readJson(file)).toMatchObject({ version: 1, data: { autoExpand: false, autoCollapse: false } });
    expect(readJson(join(result.report!.backup!, "files", "extensions", "atelier.builtin", ".atelier", "config.json"))).toEqual(original);
  } finally { storage.close(); }
});

// 文件删除与内容索引删除不跨介质原子；缺文件的无引用孤儿仍应交给正常回收。
it("内容预检只阻止持久引用缺失，不阻止未完成回收的孤儿", async () => {
  const directory = root();
  await prepareApplicationData(directory, "1.0.0");
  const file = join(directory, "db", "workspace.sqlite");
  const database = new DatabaseSync(file);
  try { database.exec("INSERT INTO contents VALUES ('orphan', 'digest', 1);"); } finally { database.close(); }
  expect((await prepareApplicationData(directory, "1.0.0")).ok).toBe(true);
  const referenced = new DatabaseSync(file);
  try {
    referenced.exec("INSERT INTO sessions VALUES ('session', 'Session', '2026-10-26', NULL, NULL); INSERT INTO content_roots VALUES ('session', '', 'record', 'record', 'orphan');");
  } finally { referenced.close(); }
  const result = await prepareApplicationData(directory, "1.0.0");
  expect(result.ok).toBe(false);
  expect(result.report!.error).toContain("Stored content orphan is missing");
});
