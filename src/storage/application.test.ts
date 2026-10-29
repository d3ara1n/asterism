import { afterEach, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareApplicationData, pluginStorages } from "./application.ts";
import { prepareData } from "./preparation.ts";
import { readJson, writeJson } from "./files.ts";
import { PluginStorage } from "../plugins/storage.ts";
import builtinStorage from "@asterism-app/builtin/storage";
import { BuiltinSettings } from "../../packages/builtin/src/settings/contract.ts";
import { applicationPackages } from "../plugins/distribution.ts";

const roots: string[] = [];
function root() { const directory = mkdtempSync(join(tmpdir(), "asterism-prepare-")); roots.push(directory); return directory; }
afterEach(() => { for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true }); });

// Business logic creates new persistent stores; preparation may build plugins without reporting a data migration.
it("preparation leaves new persistent stores uncreated and does not record a migration", async () => {
  const directory = root();
  applicationPackages(directory).setEnabled(0, false);
  expect((await prepareApplicationData(directory, "0.1.0")).ok).toBe(true);
  expect(existsSync(join(directory, "configuration.json"))).toBe(false);
  expect(existsSync(join(directory, "recovery"))).toBe(false);
});

// Managed configuration envelopes must survive reads/writes: migrated values stay readable and saves retain versions to avoid remigration or default fallback at next startup.
it("managed configuration reads and writes envelopes at declared versions", async () => {
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

// Version-mismatched envelopes fall back like corrupt bodies without throwing read errors that interrupt plugins.
it("envelope version mismatches fall back to defaults", () => {
  const directory = root();
  writeJson(join(directory, "extensions", "asterism.builtin", ".asterism", "config.json"), { version: 7, data: { autoExpand: false } });
  const storage = new PluginStorage(join(directory, "extensions"), "asterism.builtin", null, () => {}, builtinStorage);
  try { expect(storage.configuration("asterism.builtin")).toBeNull(); expect(storage.config(BuiltinSettings).get()).toEqual(BuiltinSettings.defaults); }
  finally { storage.close(); }
});

// Stamp managed databases on first open so later preparation can use user_version to determine migration needs.
it("managed databases write declared versions on first open", () => {
  const directory = root();
  const storage = new PluginStorage(join(directory, "extensions"), "acme.notes", null, () => {}, [{ kind: "sqlite", path: ".asterism/db.sqlite", version: 3, migrations: {} }]);
  try { expect(storage.db().prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 3 }); }
  finally { storage.close(); }
});
