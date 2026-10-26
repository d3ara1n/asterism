import { afterEach, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareApplicationData, pluginStorages } from "./application.ts";
import { prepareData } from "./preparation.ts";
import { readJson, writeJson } from "./files.ts";
import { PluginStorage } from "../plugins/storage.ts";
import builtinStorage from "@asterism/builtin/storage";
import { BuiltinSettings } from "../../packages/builtin/src/settings/contract.ts";

const roots: string[] = [];
function root() { const directory = mkdtempSync(join(tmpdir(), "asterism-prepare-")); roots.push(directory); return directory; }
afterEach(() => { for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true }); });

// 新安装由业务层按当前格式创建；准备阶段不应抢先写文件或误报迁移。
it("新数据目录的统一准备不创建文件也不产生恢复点", async () => {
  const directory = root();
  expect(await prepareApplicationData(directory, "0.1.0")).toEqual({ ok: true, plugins: [] });
  expect(existsSync(join(directory, "configuration.json"))).toBe(false);
  expect(existsSync(join(directory, "recovery"))).toBe(false);
});

// 托管配置的信封必须贯通读写：迁移后的值可读，保存后版本号保留，否则下次启动又会触发迁移或回退默认值。
it("托管配置按声明版本读写信封", async () => {
  const directory = root();
  const file = join(directory, "extensions", "asterism.builtin", ".asterism", "config.json");
  const declarations = [{ ...builtinStorage[0]!, version: 2, migrations: { 1: (data: unknown) => ({ ...(data as object), autoExpand: false }) } }];
  writeJson(file, { version: 1, data: BuiltinSettings.defaults });
  const result = await prepareData(directory, { version: "1", paths: [{ path: "extensions" }], stores: pluginStorages(directory, "asterism.builtin", declarations) });
  expect(result.ok).toBe(true);
  const storage = new PluginStorage(join(directory, "extensions"), "asterism.builtin", null, () => {}, declarations);
  try {
    const configuration = storage.config(BuiltinSettings);
    expect(configuration.get().autoExpand).toBe(false);
    configuration.update(value => ({ ...value, autoCollapse: false }));
    expect(readJson(file)).toMatchObject({ version: 2, data: { autoExpand: false, autoCollapse: false } });
  } finally { storage.close(); }
});

// 版本不符的信封与损坏正文一样回退默认值，不让读取抛错打断插件。
it("信封版本不符时回退默认值", () => {
  const directory = root();
  writeJson(join(directory, "extensions", "asterism.builtin", ".asterism", "config.json"), { version: 7, data: { autoExpand: false } });
  const storage = new PluginStorage(join(directory, "extensions"), "asterism.builtin", null, () => {}, builtinStorage);
  try { expect(storage.configuration("asterism.builtin")).toBeNull(); expect(storage.config(BuiltinSettings).get()).toEqual(BuiltinSettings.defaults); }
  finally { storage.close(); }
});

// 托管数据库首次打开即盖章，之后准备阶段才能据 user_version 判断是否迁移。
it("托管数据库首次打开写入声明版本", () => {
  const directory = root();
  const storage = new PluginStorage(join(directory, "extensions"), "acme.notes", null, () => {}, [{ kind: "sqlite", path: ".asterism/db.sqlite", version: 3, migrations: {} }]);
  try { expect(storage.db().prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 3 }); }
  finally { storage.close(); }
});
