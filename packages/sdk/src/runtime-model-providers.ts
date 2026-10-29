import type { ModelProviderConnection, ModelProviderPreset } from "./model-provider.ts";

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
