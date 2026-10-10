export class ConfigurationError extends Error {
  constructor(readonly code: "invalid_request" | "not_found" | "conflict" | "unavailable" | "internal", message: string) { super(message); }
}
