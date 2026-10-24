import { randomUUID } from "node:crypto";
import type { ModelRequestIdentity } from "@atelier/sdk/contracts";
import { mergeModelCompatibility } from "../shared/model-compatibility.ts";
import type { ModelProviderInput, ProviderModel } from "../shared/configuration.ts";
import { ModelFailure } from "./contract.ts";

type Target = { provider: Pick<ModelProviderInput, "compatibility">; model: Pick<ProviderModel, "compatibility"> };

/** 先合并显式覆盖，再检查最终发送值；不根据端点或模型名称启用行为。 */
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

/** 每次模型调用只创建一次；没有所属会话时，临时 ID 仅固定到本次调用。 */
export function modelRequestHeaders(target: Target, identity: ModelRequestIdentity = {}): Headers {
  const { userAgent, session, sessionId } = requestIdentity(target, identity);
  const headers = new Headers();
  if (userAgent !== undefined) headers.set("user-agent", userAgent);
  if (session) headers.set("x-opencode-session", sessionId ?? randomUUID());
  return headers;
}
