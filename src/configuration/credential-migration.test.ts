import { afterEach, describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configurationStorage, ConfigurationStore } from "./store.ts";
import { PluginStorage } from "../plugins/storage.ts";
import { prepareData, listRecoveryPoints, recoveryPointDirectory } from "../storage/preparation.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const modelRef = "11111111-1111-4111-8111-111111111111";
const oauthRef = "22222222-2222-4222-8222-222222222222";
const pluginRef = "33333333-3333-4333-8333-333333333333";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "asterism-credential-migration-"));
  roots.push(root);
  copyFileSync(join(import.meta.dirname, "fixtures", "configuration-v13.json"), join(root, "configuration.json"));
  mkdirSync(join(root, "credentials"));
  const ciphertexts = new Map([
    [modelRef, ["model ciphertext", "model-key"]],
    [oauthRef, ["OAuth ciphertext", '{"port":62986}']],
    [pluginRef, ["plugin ciphertext", "plugin-key"]],
  ]);
  for (const [reference, [ciphertext]] of ciphertexts) writeFileSync(join(root, "credentials", `${reference}.enc`), ciphertext!);
  const pluginDirectory = join(root, "extensions", "test.plugin", ".asterism");
  mkdirSync(pluginDirectory, { recursive: true });
  writeFileSync(join(pluginDirectory, "secrets.json"), JSON.stringify({ token: pluginRef }));
  const decrypt = async (encoded: string) => {
    const ciphertext = Buffer.from(encoded, "base64").toString();
    const entry = [...ciphertexts.values()].find(([encrypted]) => encrypted === ciphertext);
    if (!entry) throw new Error("Unknown ciphertext.");
    return entry[1]!;
  };
  return { root, decrypt, pluginSecrets: join(pluginDirectory, "secrets.json") };
}

const paths = [{ path: "configuration.json" }, { path: "credentials" }, { path: "extensions" }];

describe("Legacy credential migration", () => {
  it("moves decrypted values into their owners and backs up the encrypted format", async () => {
    const { root, decrypt } = setup();
    const original = readFileSync(join(root, "configuration.json"), "utf8");
    const result = await prepareData(root, { version: "test", paths, stores: [configurationStorage(root, decrypt)] });
    expect(result).toEqual({ ok: true, plugins: [] });
    const stored = new ConfigurationStore(root);
    expect(stored.get("modelProvider", "example")?.apiKey).toBe("model-key");
    expect(stored.mcpAuthorization("example")).toEqual({ port: 62986 });
    expect(stored.mcp().servers[0]).toMatchObject({ env: {}, headers: {} });
    const plugin = new PluginStorage(join(root, "extensions"), "test.plugin", () => {});
    try { expect(await plugin.secrets.get("token")).toBe("plugin-key"); }
    finally { plugin.close(); }
    const recovery = recoveryPointDirectory(root, listRecoveryPoints(root)[0]!.id);
    expect(readFileSync(join(recovery, "files", "configuration.json"), "utf8")).toBe(original);
    expect(readFileSync(join(recovery, "files", "credentials", `${modelRef}.enc`), "utf8")).toBe("model ciphertext");
    expect(configurationStorage(root).inspect()).toBeNull();
  });

  it("writes nothing when decryption fails, allowing a later retry", async () => {
    const { root, decrypt, pluginSecrets } = setup();
    const original = readFileSync(join(root, "configuration.json"), "utf8");
    const failure = await prepareData(root, { version: "test", paths, stores: [configurationStorage(root, async () => {
      throw new Error("private system error");
    })] });
    expect(failure).toMatchObject({ ok: false, error: "A saved credential could not be migrated. Allow access to the system credential store and retry." });
    expect(readFileSync(join(root, "configuration.json"), "utf8")).toBe(original);
    expect(JSON.parse(readFileSync(pluginSecrets, "utf8"))).toEqual({ token: pluginRef });
    const result = await prepareData(root, { version: "test", paths, stores: [configurationStorage(root, decrypt)] });
    expect(result.ok).toBe(true);
  });
});
