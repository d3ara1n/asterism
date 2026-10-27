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
  /** Glob for the complete URL, with * matching any characters; fetch routing matches in declaration order. */
  urlPatterns: readonly string[];
  defaultBaseUrl: string;
  /** Required credential type; null means no credentials are required. */
  credential: WebCredentialDefinition | null;
  /** Synchronous factory; baseUrl has trailing slashes removed, and credential is null if and only if the credential declaration is null. */
  create(context: { baseUrl: string; credential: string | null }): WebProviderInstance;
}
export interface WebProviderServices {
  types(): readonly WebProviderType[];
  list(): readonly WebProviderState[];
  get(id: string): WebProviderState | null;
  /** Return an invocation facade bound to the provider lifecycle; id is the provider type slug. */
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
