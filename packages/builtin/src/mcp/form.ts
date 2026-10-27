import { mcpServerSchema, SERVER_ID_PATTERN, type McpServerConfig } from "./contract.ts";
import { parseArgumentLines, parseCredentialLines } from "./catalog.ts";

/** Server being edited: arguments, idle seconds, and key-value entries retain their raw text until completion; newlines and empty values are not normalized during input. */
export interface McpDraft {
  server: McpServerConfig;
  args: string;
  idle: string;
  entries: string;
  create: boolean;
  idEdited: boolean;
}
export type McpField = "name" | "id" | "command" | "url" | "idle" | "entries";
export type McpFieldError = "required" | "invalidId" | "idTaken" | "invalidUrl" | "invalidTtl" | "invalidEntries";
export type McpDraftResult =
  | { ok: true; server: McpServerConfig; credentials: Record<string, string> }
  | { ok: false; errors: Partial<Record<McpField, McpFieldError>> };

export function entriesText(values: Record<string, string>): string {
  return Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
}
export function draftOf(server: McpServerConfig, entries: Record<string, string>, create: boolean): McpDraft {
  return { server: structuredClone(server), args: server.args.join("\n"), idle: String(server.idleSeconds), entries: entriesText(entries), create, idEdited: false };
}

/** Reports errors by field; taken contains IDs used by other servers. eager mode hides idle seconds and retains the original value when the idle value is invalid. */
export function validateDraft(draft: McpDraft, taken: readonly string[]): McpDraftResult {
  const { server } = draft, errors: Partial<Record<McpField, McpFieldError>> = {};
  if (!server.name.trim()) errors.name = "required";
  if (draft.create) {
    if (!server.id) errors.id = "required";
    else if (!SERVER_ID_PATTERN.test(server.id) || server.id.length > 64) errors.id = "invalidId";
    else if (taken.includes(server.id)) errors.id = "idTaken";
  }
  if (server.transport === "stdio" && !server.command.trim()) errors.command = "required";
  if (server.transport === "http") {
    let valid = false;
    try { valid = ["http:", "https:"].includes(new URL(server.url).protocol); } catch { /* Invalid address. */ }
    if (!valid) errors.url = server.url.trim() ? "invalidUrl" : "required";
  }
  const idle = Number(draft.idle);
  const idleValid = /^\d+$/u.test(draft.idle.trim()) && idle >= 1 && idle <= 86_400;
  if (server.mode === "lazy" && !idleValid) errors.idle = "invalidTtl";
  let credentials: Record<string, string> = {};
  try { credentials = parseCredentialLines(draft.entries); } catch { errors.entries = "invalidEntries"; }
  if (Object.keys(errors).length) return { ok: false, errors };
  const parsed = mcpServerSchema.parse({ ...server, name: server.name.trim(), command: server.command.trim(), url: server.url.trim(),
    args: parseArgumentLines(draft.args), idleSeconds: idleValid ? idle : server.idleSeconds });
  return { ok: true, server: parsed, credentials };
}
