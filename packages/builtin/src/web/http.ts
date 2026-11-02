import { WebError } from "@asterism-app/sdk/runtime";

/** JSON transport for providers whose HTTP APIs expose cancellation through native fetch. */
export async function postWebJson(provider: string, url: string, apiKey: string, body: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body), signal,
  });
  const text = await response.text();
  signal.throwIfAborted();
  if (!response.ok) throw new WebError(response.status === 400 || response.status === 422 ? "invalid_request" : "request_failed",
    `${provider} request failed (HTTP ${response.status}): ${text || response.statusText}`);
  try { return JSON.parse(text); }
  catch (cause) {
    const error = new WebError("protocol", `${provider} returned invalid JSON.`);
    error.cause = cause;
    throw error;
  }
}
