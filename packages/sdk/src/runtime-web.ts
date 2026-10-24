import type { UiText } from "./i18n.ts";
import type { WebCredentialDefinition, WebProviderState, WebProviderType, WebSearchRequest, WebFetchRequest, WebResponse, WebSearchResult, WebFetchResult } from "./web.ts";

export interface WebProviderInstance {
  search?(request: WebSearchRequest, options: { signal: AbortSignal }): Promise<WebResponse>;
  fetch?(request: WebFetchRequest, options: { signal: AbortSignal }): Promise<WebResponse>;
}
export interface WebProviderDefinition {
  id: string;
  label: UiText;
  search: boolean;
  fetch: boolean;
  /** 完整 URL 的 glob，* 匹配任意字符；fetch 路由按声明顺序匹配。 */
  urlPatterns: readonly string[];
  defaultBaseUrl: string;
  /** 所需凭据类型；null 表示无需凭据。 */
  credential: WebCredentialDefinition | null;
  /** 同步工厂；baseUrl 已去除尾斜杠，credential 为 null 当且仅当 credential 声明为 null。 */
  create(context: { baseUrl: string; credential: string | null }): WebProviderInstance;
}
export interface WebProviderServices {
  types(): readonly WebProviderType[];
  list(): readonly WebProviderState[];
  get(id: string): WebProviderState | null;
  /** 返回绑定提供方生命周期的调用门面；id 为提供方类型 slug。 */
  resolve(id: string, options: { signal: AbortSignal }): Promise<WebProviderInstance>;
  subscribe(listener: () => void): () => void;
}
export interface WebServices {
  search(request: WebSearchRequest, options: { signal: AbortSignal }): Promise<WebSearchResult>;
  fetch(request: WebFetchRequest, options: { signal: AbortSignal }): Promise<WebFetchResult>;
}
export type WebErrorCode = "provider_unavailable" | "credential_unavailable" | "unsupported" | "invalid_request" | "protocol" | "request_failed";
export class WebError extends Error {
  constructor(readonly code: WebErrorCode, message: string) { super(message); }
}
