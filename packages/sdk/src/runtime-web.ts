import type { z } from "zod";
import type { Json } from "./json.ts";
import type { UiText } from "./i18n.ts";
import type { WebProviderConnection, WebProviderType, WebSearchRequest, WebFetchRequest, WebResponse, WebSearchResult, WebFetchResult } from "./web.ts";

export interface WebProviderInstance {
  search?(request: WebSearchRequest, options: { signal: AbortSignal }): Promise<WebResponse>;
  fetch?(request: WebFetchRequest, options: { signal: AbortSignal }): Promise<WebResponse>;
}
export interface WebProviderDefinition {
  id: string;
  label: UiText;
  search: boolean;
  fetch: boolean;
  /** 完整 URL 的 glob，* 匹配任意字符；提供方及其 pattern 均按列表顺序匹配。 */
  urlPatterns: readonly string[];
  settingsSchema: z.ZodType<Json>;
  defaults: Pick<WebProviderConnection, "baseUrl" | "auth" | "settings">;
  keyUrl?: string;
  create(context: { connection: WebProviderConnection; credential: string | null }): WebProviderInstance;
}
export interface WebProviderServices {
  types(): readonly WebProviderType[];
  list(): readonly WebProviderConnection[];
  get(id: string): WebProviderConnection | null;
  resolve(id: string, options: { signal: AbortSignal }): Promise<WebProviderInstance>;
  subscribe(listener: () => void): () => void;
}
export interface WebServices {
  search(request: WebSearchRequest, options: { provider: string; signal: AbortSignal }): Promise<WebSearchResult>;
  fetch(request: WebFetchRequest, options: { signal: AbortSignal }): Promise<WebFetchResult>;
}
export type WebErrorCode = "provider_unavailable" | "credential_unavailable" | "unsupported" | "invalid_request" | "protocol" | "request_failed";
export class WebError extends Error {
  constructor(readonly code: WebErrorCode, message: string) { super(message); }
}
