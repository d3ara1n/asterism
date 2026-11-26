import type { LanguageModelProviderConnection, LanguageModelProviderPreset } from "./model-provider.ts";

export interface LanguageModelProviderServices {
  presets(): readonly LanguageModelProviderPreset[];
  list(): readonly LanguageModelProviderInfo[];
  get(id: string): LanguageModelProviderInfo | null;
  /** Backend only; reads the connection's current credentials, returning null for connections without authentication. */
  credential(id: string, options?: { signal?: AbortSignal }): Promise<string | null>;
  /** Connection or preset catalog changes; returns an unsubscribe function and unsubscribes automatically when the plugin closes. */
  subscribe(listener: () => void): () => void;
}
export interface LanguageModelProviderInfo extends LanguageModelProviderConnection {
  id: string;
  name: string;
  enabled: boolean;
}
