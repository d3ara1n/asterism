import type { UiText } from "@atelier/sdk/contracts";
import type { PluginApiError } from "@atelier/sdk/runtime";
import { SessionError } from "../shared/session-path.ts";

/** 自定义业务原因没有展示描述时，保留插件原文，避免套用宿主同名错误码。 */
export function pluginErrorDisplay(error: PluginApiError): UiText | undefined {
  return error.display ?? (error.reason ? error.message : undefined);
}

/** 准备与执行阶段使用同一会话错误映射，并保留消息归属。 */
export function sessionPluginError(error: PluginApiError): SessionError {
  const code = error.reason ?? (
    error.code === "invalid_argument" || error.code === "rejected" ? "invalid_request"
      : error.code === "not_found" || error.code === "conflict" ? error.code : "unavailable"
  );
  return new SessionError(code, error.message, pluginErrorDisplay(error));
}
