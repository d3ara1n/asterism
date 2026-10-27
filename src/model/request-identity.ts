import { randomUUID } from "node:crypto";
import type { ModelRequestIdentity } from "@asterism-app/sdk/contracts";
import { mergeModelCompatibility } from "../shared/model-compatibility.ts";
import type { ModelProviderInput, ProviderModel } from "../shared/configuration.ts";
import { ModelFailure } from "./contract.ts";

type Target = { provider: Pick<ModelProviderInput, "compatibility">; model: Pick<ProviderModel, "compatibility"> };

/** Merge explicit overrides before checking final transmitted values; endpoint and model names do not enable behavior. */
function requestIdentity(target: Target, identity: ModelRequestIdentity) {
  const entries = mergeModelCompatibility(target.provider.compatibility, target.model.compatibility);
  const custom = entries.find(entry => entry.id === "customUserAgent");
  const userAgent = custom && "value" in custom
    ? (custom.value as { userAgent: string }).userAgent : identity.userAgent;
  const session = entries.some(entry => entry.id === "opencodeSession");
  for (const [name, value] of [["User-Agent", userAgent], ["Session ID", session ? identity.sessionId : undefined]] as const) {
    if (value !== undefined && (typeof value !== "string" || !value.trim() || !/^[\x20-\x7e]+$/u.test(value)))
      throw new ModelFailure("invalid_argument", `${name} must be a non-empty printable ASCII header value.`);
  }
  return { userAgent, session, sessionId: identity.sessionId };
}

export function validateRequestIdentity(target: Target, identity: ModelRequestIdentity): void {
  requestIdentity(target, identity);
}

/** Create once per model call; without an owning session, the temporary ID is stable only for this call. */
export function modelRequestHeaders(target: Target, identity: ModelRequestIdentity = {}): Headers {
  const { userAgent, session, sessionId } = requestIdentity(target, identity);
  const headers = new Headers();
  if (userAgent !== undefined) headers.set("user-agent", userAgent);
  if (session) headers.set("x-opencode-session", sessionId ?? randomUUID());
  return headers;
}
