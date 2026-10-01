import { protocolVersion, requestSchema, type RuntimeMessage } from "../shared/contracts.ts";
import { ApplicationError, type ApplicationService } from "./service.ts";
import { configurationRequestSchema, configurationResponseSchema, configurationVersion } from "../shared/configuration.ts";
import { ConfigurationError } from "../configuration/repository.ts";

/** 配置响应独立于工作台投影，保存设置不会重新加载当前会话。 */
export async function dispatchConfiguration(service: ApplicationService, raw: unknown): Promise<unknown | null> {
  const request = configurationRequestSchema.safeParse(raw);
  if (!request.success) return null;
  const envelope = { kind: "configuration.response" as const, version: configurationVersion, id: request.data.id };
  try {
    const result = await service.configuration.execute(request.data.command);
    return configurationResponseSchema.parse({ ...envelope, result: { ok: true, ...result } });
  } catch (error) {
    const known = error instanceof ConfigurationError;
    if (!known) console.error("Configuration command failed.");
    return { ...envelope, result: { ok: false, error: {
      code: known ? error.code : "internal", message: known ? error.message : "The configuration command could not be completed. Reload settings before retrying.",
    } } };
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
      } },
    };
  }
}
