import { PluginApiError } from "@asterism/sdk/runtime";

import { ConfigurationError } from "../configuration/errors.ts";
import { SessionError } from "../session/tree.ts";
import type { ConnectionService, ConnectionServices } from "../shared/connection.ts";
import type { CommandResult, RuntimeMessage } from "../shared/contracts.ts";
import { protocolVersion, requestSchema } from "../shared/contracts.ts";
import type { ConfigurationResult } from "../shared/configuration.ts";
import type { ContentResult } from "../shared/content.ts";
import type { PluginConfigurationResult } from "../shared/plugin-configuration.ts";
import type { SessionResult } from "../shared/session.ts";
import { sessionPluginError } from "./plugin-errors.ts";
import { ApplicationError, type ApplicationService } from "./service.ts";

/** 校验不可信命令并转为结果；不把堆栈、路径或原始异常返回 renderer。各领域服务自行解析命令结构。 */
export function serveWorkspace(service: ApplicationService, command: unknown): CommandResult {
  try { return { ok: true, snapshot: service.execute(command) }; }
  catch (error) {
    const known = error instanceof ApplicationError;
    if (!known) console.error("Application command failed.", error);
    return { ok: false, error: { code: known ? error.code : "internal",
      message: known ? error.message : "The command could not be completed. Reload the workspace before trying again.",
      ...(known && error.display !== undefined ? { display: error.display } : {}) } };
  }
}

export async function serveSession(service: ApplicationService, command: unknown): Promise<SessionResult> {
  try { return { ok: true, reply: await service.sessions.execute(command) }; }
  catch (error) {
    const failure = error instanceof PluginApiError ? sessionPluginError(error) : error;
    const known = failure instanceof SessionError || failure instanceof ConfigurationError;
    if (!known) console.error("Session command failed.", failure);
    return { ok: false, error: { code: known ? failure.code : "internal", message: known ? failure.message : "The session command could not be completed.",
      ...(known && failure.display !== undefined ? { display: failure.display } : {}) } };
  }
}

/** 配置响应独立于工作台投影，保存设置不会重新加载当前会话。 */
export async function serveConfiguration(service: ApplicationService, command: unknown): Promise<ConfigurationResult> {
  try { return { ok: true, ...await service.configuration.execute(command) }; }
  catch (error) {
    const known = error instanceof ConfigurationError;
    if (!known) console.error("Configuration command failed.", error);
    return { ok: false, error: { code: known ? error.code : "internal",
      message: known ? error.message : "The configuration command could not be completed. Reload settings before retrying.",
      ...(known && error.display !== undefined ? { display: error.display } : {}) } };
  }
}

export function servePluginConfiguration(service: ApplicationService, command: unknown): PluginConfigurationResult {
  try { return { ok: true, configurations: service.configurePlugin(command) }; }
  catch (error) {
    const known = error instanceof ApplicationError;
    if (!known) console.error("Plugin configuration command failed.", error);
    return { ok: false, error: { code: known ? error.code : "internal", message: known ? error.message : "Plugin configuration could not be completed.",
      ...(known && error.display !== undefined ? { display: error.display } : {}) } };
  }
}

export async function serveContent(service: ApplicationService, command: unknown): Promise<ContentResult> {
  try { return { ok: true, reply: await service.content.execute(command) }; }
  catch (error) {
    const known = error instanceof PluginApiError || error instanceof SessionError;
    if (!known) console.error("Content transfer failed.", error);
    return { ok: false, error: { code: known ? error.code : "internal", message: known ? error.message : "Content transfer could not be completed." } };
  }
}

/** 直连请求按服务名分派；未知服务视为无效请求。 */
export async function serve(service: ApplicationService, name: ConnectionService, command: unknown): Promise<ConnectionServices[ConnectionService]["result"]> {
  switch (name) {
    case "workspace": return serveWorkspace(service, command);
    case "session": return serveSession(service, command);
    case "configuration": return serveConfiguration(service, command);
    case "plugin-configuration": return servePluginConfiguration(service, command);
    case "content": return serveContent(service, command);
    default: return { ok: false, error: { code: "invalid_request", message: "Unknown runtime service." } };
  }
}

/** 主进程控制链路上的工作区请求（退出确认等）；renderer 不经此入口。 */
export function dispatch(service: ApplicationService, raw: unknown): RuntimeMessage | null {
  const request = requestSchema.safeParse(raw);
  if (!request.success) return null;
  return { kind: "response", version: protocolVersion, id: request.data.id, result: serveWorkspace(service, request.data.command) };
}
