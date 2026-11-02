import { ApiError, RATE_LIMIT_DELAY } from "@tencent-connect/qqbot-nodejs/protocol";
import { MessagingError } from "@asterism-app/sdk/runtime";
import { prepareSend } from "./outcome.ts";

const apiUrl = "https://api.bot.qq.com";

/** Preserve platform refusals separately from requests whose delivery is unknown. */
export function qqApiError(error: ApiError, retryAfterMs?: number): MessagingError {
  const detail = `QQ: HTTP ${error.httpStatus}${error.bizCode === undefined ? "" : `, code ${error.bizCode}`} — ${error.bizMessage ?? error.message}`;
  if (error.httpStatus === 429 || error.bizCode === 100001)
    return new MessagingError("request_failed", detail, { cause: error, retryAfterMs: retryAfterMs ?? RATE_LIMIT_DELAY });
  if (error.httpStatus === 0 || error.httpStatus >= 500 || (error.httpStatus < 400 && error.bizCode === undefined))
    return new MessagingError("request_failed", detail, { cause: error });
  const unavailable = error.httpStatus === 401 || error.httpStatus === 403 || [10004, 100007, 100016].includes(error.bizCode!);
  return new MessagingError(unavailable ? "unavailable" : "invalid_input", detail, { cause: error });
}

/** QQ reports some API failures in a successful HTTP response, including invalid app credentials. */
export async function qqResponse<T>(response: Response, path: string): Promise<T> {
  const text = await response.text();
  let data: { code?: number; err_code?: number; message?: string };
  try { data = JSON.parse(text); }
  catch (cause) {
    if (response.ok) throw new Error("QQ returned an invalid JSON response.", { cause });
    throw qqApiError(new ApiError(`QQ returned HTTP ${response.status}.`, response.status, path));
  }
  const code = data.code ?? data.err_code;
  if (!response.ok || (code !== undefined && code !== 0)) {
    const retryAfter = response.headers.get("retry-after");
    const delay = retryAfter === null ? undefined : /^\d+(?:\.\d+)?$/.test(retryAfter)
      ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now());
    throw qqApiError(new ApiError(data.message ?? `QQ returned HTTP ${response.status}.`, response.status, path, code, data.message),
      delay !== undefined && Number.isFinite(delay) ? delay : undefined);
  }
  return data as T;
}

/** Credentials belong to one captured connection. Each HTTP operation owns its cancellation signal. */
export class QQApi {
  private token?: { value: string; expiresAt: number };
  constructor(private readonly appId: string, private readonly appSecret: string) {}
  clearToken(): void { this.token = undefined; }

  async accessToken(signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const path = "/app/getAppAccessToken";
    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: this.appId, clientSecret: this.appSecret }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    const data = await qqResponse<{ access_token: string; expires_in: string | number }>(response, path);
    if (!data.access_token) throw new MessagingError("request_failed", "QQ did not return an access token.");
    this.token = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 };
    return data.access_token;
  }

  async request<T>(method: string, path: string, signal: AbortSignal, body?: unknown): Promise<T> {
    return this.transmit<T>(await this.accessToken(signal), method, path, signal, body);
  }

  async send<T>(path: string, signal: AbortSignal, body: unknown): Promise<T> {
    const token = await prepareSend(signal, () => this.accessToken(signal));
    return this.transmit<T>(token, "POST", path, signal, body);
  }

  private async transmit<T>(token: string, method: string, path: string, signal: AbortSignal, body?: unknown): Promise<T> {
    const response = await fetch(`${apiUrl}${path}`, {
      method, headers: { Authorization: `QQBot ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (response.status === 401) this.clearToken();
    return qqResponse<T>(response, path);
  }
}
