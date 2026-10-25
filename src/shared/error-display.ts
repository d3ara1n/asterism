import { defineMessages, pluginNamespace, type UiText } from "@atelier/sdk/contracts";
/** 稳定公共错误码的界面说明；英文诊断与插件业务提示保持原样。 */
export const errorMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  invalid_request: { id: "error.invalidRequest", defaultMessage: "The request is invalid. Check your input and try again." },
  not_found: { id: "error.notFound", defaultMessage: "The requested item is no longer available." },
  conflict: { id: "error.conflict", defaultMessage: "The operation cannot run in the current state." },
  unavailable: { id: "error.unavailable", defaultMessage: "The operation is currently unavailable. Reload before retrying." },
  tool_files_unsupported: { id: "error.toolFilesUnsupported", defaultMessage: "Chat Completions cannot carry files in tool results. Add the 'Tool files in a user message' compatibility setting or choose another protocol." },
  internal: { id: "error.internal", defaultMessage: "The operation could not be completed. Check the application logs." },
}));
export function errorDisplay(error: { code: string; message: string; display?: UiText }): UiText {
  return error.display ?? (Object.hasOwn(errorMessages, error.code) ? errorMessages[error.code as keyof typeof errorMessages] : error.message);
}
export const startupMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  quitTitle: { id: "shutdown.title", defaultMessage: "Close running resources?" },
  quitDescription: { id: "shutdown.description", defaultMessage: "These resources may still have running programs. Quitting will end their live instances:\n\n{resources}" },
  quitConfirm: { id: "shutdown.confirm", defaultMessage: "Quit" },
  quitCancel: { id: "shutdown.cancel", defaultMessage: "Cancel" },
  windowLoadFailed: { id: "startup.windowLoadFailed", defaultMessage: "The application window could not be loaded." },
  workspaceOpenFailed: { id: "startup.workspaceOpenFailed", defaultMessage: "The workspace could not be opened." },
  environment: { id: "startup.environment", defaultMessage: "Preparing your environment…" },
  plugins: { id: "startup.plugins", defaultMessage: "Loading plugins…" },
  workspace: { id: "startup.workspace", defaultMessage: "Opening your workspace…" },
  interface: { id: "startup.interface", defaultMessage: "Preparing the interface…" },
  failed: { id: "startup.failed", defaultMessage: "Atelier could not finish starting" },
  failedBody: { id: "startup.failedBody", defaultMessage: "Restart the application to try again. The logs contain more details." },
  timedOut: { id: "startup.timedOut", defaultMessage: "Startup took too long. Restart the application to try again." },
  databaseVersion: { id: "startup.databaseVersion", defaultMessage: "This development data uses a different format. Open the data folder to inspect it before restarting." },
  restart: { id: "startup.restart", defaultMessage: "Restart application" },
  openLogs: { id: "startup.openLogs", defaultMessage: "Open logs" },
  openData: { id: "startup.openData", defaultMessage: "Open data folder" },
  details: { id: "startup.details", defaultMessage: "Details" },
  copyDetails: { id: "startup.copyDetails", defaultMessage: "Copy details" },
  copiedDetails: { id: "startup.copiedDetails", defaultMessage: "Copied" },
}));
