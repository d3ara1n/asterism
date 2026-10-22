import { PluginApiError } from "@atelier/sdk/runtime";
import type { z } from "zod";

import { ConfigurationError } from "../configuration/errors.ts";
import { SessionError } from "../session/tree.ts";
import { configurationRequestSchema, configurationVersion, type configurationResponseSchema } from "../shared/configuration.ts";
import { contentRequestSchema, contentVersion, type contentResponseSchema } from "../shared/content.ts";
import { protocolVersion, requestSchema, type RuntimeMessage } from "../shared/contracts.ts";
import { pluginConfigurationRequestSchema, pluginConfigurationVersion, type pluginConfigurationResponseSchema } from "../shared/plugin-configuration.ts";
import { sessionRequestSchema, sessionVersion, type sessionResponseSchema } from "../shared/session.ts";
import { sessionPluginError } from "./plugin-errors.ts";
import { ApplicationError, type ApplicationService } from "./service.ts";

export async function dispatchContent(service: ApplicationService, raw: unknown): Promise<z.infer<typeof contentResponseSchema> | null> {
  const parsed = contentRequestSchema.safeParse(raw);
  if (!parsed.success) return null;
  const envelope = { kind: "content.response", version: contentVersion, id: parsed.data.id } as const;
  try {
    return { ...envelope, result: { ok: true, reply: await service.content.execute(parsed.data.command) } };
  } catch (error) {
    const known = error instanceof PluginApiError || error instanceof SessionError;
    if (!known) console.error("Content transfer failed.");
    return { ...envelope, result: { ok: false, error: {
      code: known ? error.code : "internal", message: known ? error.message : "Content transfer could not be completed.",
    } } };
  }
}

export function dispatchPluginConfiguration(service: ApplicationService, raw: unknown): z.infer<typeof pluginConfigurationResponseSchema> | null {
  const request = pluginConfigurationRequestSchema.safeParse(raw);
  if (!request.success) return null;
  const envelope = { kind: "plugin-configuration.response", version: pluginConfigurationVersion, id: request.data.id } as const;
  try {
    return { ...envelope, result: { ok: true, configurations: service.configurePlugin(request.data.command) } };
  } catch (error) {
    const known = error instanceof ApplicationError;
    if (!known) console.error("Plugin configuration command failed.");
    return { ...envelope, result: { ok: false, error: {
      code: known ? error.code : "internal", message: known ? error.message : "Plugin configuration could not be completed.", ...(known && error.display !== undefined ? { display: error.display } : {}),
    } } };
  }
}

/** 配置响应独立于工作台投影，保存设置不会重新加载当前会话。 */
export async function dispatchConfiguration(service: ApplicationService, raw: unknown): Promise<z.infer<typeof configurationResponseSchema> | null> {
  const request = configurationRequestSchema.safeParse(raw);
  if (!request.success) return null;
  const envelope = { kind: "configuration.response", version: configurationVersion, id: request.data.id } as const;
  try {
    const result = await service.configuration.execute(request.data.command);
    return { ...envelope, result: { ok: true, ...result } };
  } catch (error) {
    const known = error instanceof ConfigurationError;
    if (!known) console.error("Configuration command failed.");
    return { ...envelope, result: { ok: false, error: {
      code: known ? error.code : "internal", message: known ? error.message : "The configuration command could not be completed. Reload settings before retrying.", ...(known && error.display !== undefined ? { display: error.display } : {}),
    } } };
  }
}

export async function dispatchSession(service: ApplicationService, raw: unknown): Promise<z.infer<typeof sessionResponseSchema> | null> {
  const parsed = sessionRequestSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { id, command } = parsed.data;
  try {
    const reply = await service.sessions.execute(command);
    return { kind: "session.response", version: sessionVersion, id, result: { ok: true, reply } };
  } catch (error) {
    const failure = error instanceof PluginApiError ? sessionPluginError(error) : error;
    const known = failure instanceof SessionError || failure instanceof ConfigurationError;
    if (!known) console.error("Session command failed.");
    return { kind: "session.response", version: sessionVersion, id, result: { ok: false,
      error: { code: known ? failure.code : "internal", message: known ? failure.message : "The session command could not be completed.", ...(known && failure.display !== undefined ? { display: failure.display } : {}) } } };
  }
}

/** 校验不可信传输数据；不把堆栈、路径或原始异常返回 renderer。 */
export function dispatch(service: ApplicationService, raw: unknown): RuntimeMessage | null {
  const request = requestSchema.safeParse(raw);
  if (!request.success) return null;
  try {
    return { kind: "response", version: protocolVersion, id: request.data.id, result: { ok: true, snapshot: service.execute(request.data.command) } };
  } catch (error) {
    const known = error instanceof ApplicationError;
    if (!known) console.error("Application command failed.", error);
    return {
      kind: "response", version: protocolVersion, id: request.data.id,
      result: { ok: false, error: {
        code: known ? error.code : "internal",
        message: known ? error.message : "The command could not be completed. Reload the workspace before trying again.",
        ...(known && error.display !== undefined ? { display: error.display } : {}),
      } },
    };
  }
}
