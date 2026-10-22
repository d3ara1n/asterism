import { defineMessages, pluginNamespace, type UiText } from "@atelier/sdk/contracts";
/** 稳定公共错误码的界面说明；英文诊断与插件业务提示保持原样。 */
export const errorMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  invalid_request: { id: "error.invalidRequest", defaultMessage: "The request is invalid. Check your input and try again." },
  not_found: { id: "error.notFound", defaultMessage: "The requested item is no longer available." },
  conflict: { id: "error.conflict", defaultMessage: "The operation cannot run in the current state." },
  unavailable: { id: "error.unavailable", defaultMessage: "The operation is currently unavailable. Reload before retrying." },
  thinking_unavailable: { id: "error.thinkingUnavailable", defaultMessage: "The thinking level is unavailable for this model. Choose an enabled thinking level or update the role configuration." },
  tool_files_unsupported: { id: "error.toolFilesUnsupported", defaultMessage: "Chat Completions cannot carry files in tool results. Add the 'Tool files in a user message' compatibility setting or choose another protocol." },
  internal: { id: "error.internal", defaultMessage: "The operation could not be completed. Check the application logs." },
}));
export function errorDisplay(error: { code: string; message: string; display?: UiText }): UiText {
  return error.display ?? (Object.hasOwn(errorMessages, error.code) ? errorMessages[error.code as keyof typeof errorMessages] : error.message);
}
export const startupMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  windowLoadFailed: { id: "startup.windowLoadFailed", defaultMessage: "The application window could not be loaded." },
  workspaceOpenFailed: { id: "startup.workspaceOpenFailed", defaultMessage: "The workspace could not be opened." },
}));
