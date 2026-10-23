import { mcpServerSchema, SERVER_ID_PATTERN, type McpServerConfig } from "./contract.ts";
import { parseArgumentLines, parseCredentialLines } from "./catalog.ts";

/** 编辑中的服务器：参数、空闲秒数与键值条目保留原文，完成时再解析，输入过程中的换行与空值不被即时规整。 */
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

/** 逐字段给出错误；taken 为其他服务器已占用的 ID。eager 模式不显示空闲秒数，空闲值无效时沿用原值。 */
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
    try { valid = ["http:", "https:"].includes(new URL(server.url).protocol); } catch { /* 无效地址。 */ }
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
