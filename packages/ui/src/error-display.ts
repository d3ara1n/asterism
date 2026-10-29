import { defineMessages, pluginNamespace, type UiText } from "@asterism-app/sdk/contracts";

/** UI explanations for stable public error codes; English diagnostics and plugin business prompts remain unchanged. */
export const errorMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  invalid_request: { id: "error.invalidRequest", defaultMessage: "The request is invalid. Check your input and try again." },
  not_found: { id: "error.notFound", defaultMessage: "The requested item is no longer available." },
  conflict: { id: "error.conflict", defaultMessage: "The operation cannot run in the current state." },
  unavailable: { id: "error.unavailable", defaultMessage: "The operation is currently unavailable. Reload before retrying." },
  tool_files_unsupported: { id: "error.toolFilesUnsupported", defaultMessage: "Chat Completions cannot carry files in tool results. Add the 'Tool files in a user message' compatibility setting or choose another protocol." },
  internal: { id: "error.internal", defaultMessage: "The operation could not be completed. Check the application logs." },
}));
/** One selection rule for receipts and thrown failures: explicit display, localized code, the operation's fallback, then the diagnostic message. */
export function errorDisplay(error: { code: string; message: string; display?: UiText }, fallback?: UiText): UiText {
  return error.display ?? (Object.hasOwn(errorMessages, error.code) ? errorMessages[error.code as keyof typeof errorMessages] : fallback ?? error.message);
}
export function failureDisplay(error: unknown, fallback: UiText): UiText {
  if (!error || typeof error !== "object") return fallback;
  const value = error as { code?: unknown; message?: unknown; display?: UiText };
  return errorDisplay({ code: typeof value.code === "string" ? value.code : "", message: typeof value.message === "string" ? value.message : "", display: value.display }, fallback);
}
