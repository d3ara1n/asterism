import { join } from "node:path";
import { applicationStorage } from "../../shared/application.ts";
import { configurationVersion } from "../formats.ts";
import { jsonStorage } from "./engine.ts";
import { migrateConfiguration13 } from "./credentials.ts";

/**
 * v12 web providers held one API key reference; v13 stores provider settings and secret references by setting key,
 * and adds messaging connections.
 */
function migrateConfiguration12(value: unknown): unknown {
  const document = value as { webProviders?: { id: string; enabled: boolean; credentialRef: string | null }[] };
  return { ...document, messagingConnections: [], webProviders: (document.webProviders ?? []).map(({ credentialRef, ...provider }) => ({
    ...provider, settings: {}, secretRefs: credentialRef ? { apiKey: credentialRef } : {},
  })) };
}
/** Append conversions for released formats here; business reads and writes always consume the current document. */
export function configurationStorage(root: string, decrypt?: (ciphertext: string) => Promise<string>) {
  return jsonStorage({ id: "configuration", file: join(root, applicationStorage.configurationFile), version: configurationVersion,
    migrations: { 12: migrateConfiguration12, 13: value => migrateConfiguration13(root, value, decrypt),
      14: value => ({ ...(value as object), sessionLifecycle: { retentionDays: 30, sleepDays: 7 } }),
      15: value => ({ ...(value as object), showUsage: true }),
      16: value => ({ ...(value as object), usageBudget: null }) } });
}
