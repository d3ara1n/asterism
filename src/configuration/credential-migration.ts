import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { applicationStorage } from "../shared/application.ts";
import { readJson, writeJson } from "../storage/files.ts";

type Decrypt = (ciphertext: string) => Promise<string>;
type References = Record<string, string>;
interface Version13 {
  modelProviders?: ({ credentialRef?: string | null } & Record<string, unknown>)[];
  webProviders?: ({ settings?: Record<string, string>; secretRefs?: References } & Record<string, unknown>)[];
  messagingConnections?: ({ settings?: Record<string, string>; secretRefs?: References } & Record<string, unknown>)[];
  mcp?: { servers?: ({ id: string; transport: string } & Record<string, unknown>)[] };
  mcpCredentialRefs?: References;
  [key: string]: unknown;
}

const reference = z.string().uuid();
const pluginReferences = z.record(z.string(), z.string());
const variables = z.record(z.string(), z.string());

function directories(path: string): string[] {
  try { return readdirSync(path, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

/**
 * v13 stored references to `safeStorage` ciphertext files; v14 stores values where they are used.
 * Model keys, provider secrets, and MCP environment or headers move into their entries, MCP OAuth state into
 * `mcpAuthorizations`, and plugin secrets into each plugin's `secrets.json`. Every value is decrypted before any write.
 */
export async function migrateConfiguration13(root: string, value: unknown, decrypt?: Decrypt): Promise<unknown> {
  const document = value as Version13;
  const extensions = join(root, "extensions");
  const pluginFiles = directories(extensions).flatMap(id => {
    const file = join(extensions, id, ".asterism", "secrets.json");
    const saved = readJson(file);
    return saved === undefined ? [] : [{ file, references: pluginReferences.parse(saved) }];
  });
  const referenced = new Set([
    ...(document.modelProviders ?? []).flatMap(provider => provider.credentialRef ? [provider.credentialRef] : []),
    ...[...document.webProviders ?? [], ...document.messagingConnections ?? []].flatMap(entry => Object.values(entry.secretRefs ?? {})),
    ...Object.values(document.mcpCredentialRefs ?? {}),
    ...pluginFiles.flatMap(item => Object.values(item.references)),
  ].filter(item => reference.safeParse(item).success));

  const values = new Map<string, string>();
  for (const ref of referenced) {
    let ciphertext: Buffer;
    try { ciphertext = readFileSync(join(root, applicationStorage.credentialsDirectory, `${ref}.enc`)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (!decrypt) throw new Error("Legacy credential migration requires system decryption.");
    try { values.set(ref, await decrypt(ciphertext.toString("base64"))); }
    catch { throw new Error("A saved credential could not be migrated. Allow access to the system credential store and retry."); }
  }
  const secrets = (refs: References | undefined) => Object.fromEntries(Object.entries(refs ?? {})
    .flatMap(([key, ref]) => values.has(ref) ? [[key, values.get(ref)!]] : []));
  const mcpValue = (key: string) => {
    const ref = document.mcpCredentialRefs?.[key];
    const saved = ref === undefined ? undefined : values.get(ref);
    return saved === undefined ? undefined : JSON.parse(saved) as unknown;
  };

  // A retry after an interrupted commit finds plugin values already written; entries without a decrypted reference stay as they are.
  for (const { file, references } of pluginFiles)
    writeJson(file, Object.fromEntries(Object.entries(references).map(([key, ref]) => [key, values.get(ref) ?? ref])));

  const { mcpCredentialRefs: _refs, ...rest } = document;
  return {
    ...rest,
    modelProviders: (document.modelProviders ?? []).map(({ credentialRef, ...provider }) => ({
      ...provider, apiKey: credentialRef ? values.get(credentialRef) ?? "" : "",
    })),
    webProviders: (document.webProviders ?? []).map(({ secretRefs, ...provider }) => ({
      ...provider, settings: { ...provider.settings, ...secrets(secretRefs) },
    })),
    messagingConnections: (document.messagingConnections ?? []).map(({ secretRefs, ...connection }) => ({
      ...connection, settings: { ...connection.settings, ...secrets(secretRefs) },
    })),
    mcp: { ...document.mcp, servers: (document.mcp?.servers ?? []).map(server => {
      const entries = variables.parse(mcpValue(`mcp.${server.id}.credentials`) ?? {});
      return { ...server, env: server.transport === "stdio" ? entries : {}, headers: server.transport === "http" ? entries : {} };
    }) },
    mcpAuthorizations: Object.fromEntries((document.mcp?.servers ?? []).flatMap(server => {
      const saved = mcpValue(`mcp.${server.id}.oauth`);
      return saved === undefined ? [] : [[server.id, saved]];
    })),
  };
}
