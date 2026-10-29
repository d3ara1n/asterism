import type { ModelProviderConnection, ModelProviderPreset, ProviderUsageError, UsageItem, UsageProviderInfo } from "./provider-usage.ts";
import type { UiText } from "./i18n.ts";

/** Consumers explicitly supply the connection and credentials required for the query. */
export interface UsageQueryContext {
  readonly connection: { id: string; endpoint: string };
  readonly credential: string | null;
  readonly signal: AbortSignal;
}
interface UsageProviderIdentity {
  readonly id: string;
  readonly label: UiText;
}
export interface QueryUsageProvider extends UsageProviderIdentity {
  readonly source?: "query";
  query(context: UsageQueryContext): Promise<UsageItem[]>;
}
export interface UsageHeadersContext {
  readonly connection: { id: string; endpoint: string };
  readonly model: string;
  readonly status: number;
  readonly receivedAt: number;
  readonly headers: Readonly<Record<string, string>>;
}
/** Consumers supply response metadata they obtained themselves; the parser makes no network requests. */
export interface HeadersUsageProvider extends UsageProviderIdentity {
  readonly source: "headers";
  /** null means no usable data this time; an empty list explicitly reports no quota items. */
  parseHeaders(context: UsageHeadersContext): UsageItem[] | null;
}
export type UsageProvider = QueryUsageProvider | HeadersUsageProvider;
/** Providers report publicly exposable error categories; raw responses and credentials are not delivered across processes. */
export class UsageQueryError extends Error {
  constructor(readonly code: ProviderUsageError) { super(`Provider usage query failed: ${code}.`); }
}
export interface ModelProviderServices {
  presets(): readonly ModelProviderPreset[];
  list(): readonly ModelProviderInfo[];
  get(id: string): ModelProviderInfo | null;
  /** Backend only; reads the connection's current credentials, returning null for connections without authentication. */
  credential(id: string, options?: { signal?: AbortSignal }): Promise<string | null>;
  /** Connection or preset catalog changes; returns an unsubscribe function and unsubscribes automatically when the plugin closes. */
  subscribe(listener: () => void): () => void;
}
export interface ModelProviderInfo extends ModelProviderConnection {
  id: string;
  name: string;
  enabled: boolean;
}
export interface UsageProviderServices {
  list(): readonly UsageProviderInfo[];
  /** Obtain an implementation bound to the provider lifecycle; does not select connections, read credentials, or save results. */
  get(id: string): UsageProvider | null;
  subscribe(listener: () => void): () => void;
}
/** Stateless invocation facade; consumers explicitly supply connections, credentials, and responses. */
export interface UsageServices {
  query(providerId: string, context: UsageQueryContext): Promise<UsageItem[]>;
  parseHeaders(providerId: string, context: UsageHeadersContext): UsageItem[] | null;
}

/** Host cache and shared queries; consumers supply response headers they obtained themselves. */
export interface ProviderUsage {
  query(id: string, options?: { signal?: AbortSignal; refresh?: boolean }): Promise<import("./usage-state.ts").ProviderUsageState>;
  consume(response: import("./models.ts").ModelResponse): void;
}
