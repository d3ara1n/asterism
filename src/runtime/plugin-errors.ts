import type { UiText } from "@asterism/sdk/contracts";
import type { PluginApiError } from "@asterism/sdk/runtime";
import { SessionError } from "../shared/session-timeline.ts";

/** Preserve original plugin text when custom business reasons lack display descriptions instead of applying same-name host error codes. */
export function pluginErrorDisplay(error: PluginApiError): UiText | undefined {
  return error.display ?? (error.reason ? error.message : undefined);
}

/** Preparation and execution share the session error mapping and retain message ownership. */
export function sessionPluginError(error: PluginApiError): SessionError {
  const code = error.reason ?? (
    error.code === "invalid_argument" || error.code === "rejected" ? "invalid_request"
      : error.code === "not_found" || error.code === "conflict" ? error.code : "unavailable"
  );
  return new SessionError(code, error.message, pluginErrorDisplay(error));
}
