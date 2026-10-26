import type { UiText } from "@asterism/sdk/contracts";
export class ConfigurationError extends Error {
  constructor(readonly code: "invalid_request" | "not_found" | "conflict" | "unavailable" | "internal", message: string, readonly display?: UiText) { super(message); }
}
