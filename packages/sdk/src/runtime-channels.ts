import type { ChannelContract, ChannelEnd, ChannelValue } from "./channels.ts";
import type { ObjectReader } from "./objects.ts";

/**
 * The backend end of a channel. Messages are delivered in send order; messages arriving before listener registration are buffered and delivered in order when the first listener registers.
 * signal aborts when either end closes, the object leaves the current set, the plugin shuts down, or the connection disconnects; reason is ChannelEnd.
 */
export interface ObjectChannel<Up extends ChannelValue = ChannelValue, Down extends ChannelValue = ChannelValue> {
  readonly object: ObjectReader;
  readonly signal: AbortSignal;
  send(data: Down): void;
  onMessage(listener: (data: Up) => void): () => void;
  close(): void;
}
export interface ChannelContribution {
  readonly contract: ChannelContract;
  /** Called when the frontend opens a channel; throwing PluginApiError ends the channel with unavailable. */
  open(channel: ObjectChannel): void | Promise<void>;
}
export function implementChannel<Up extends ChannelValue, Down extends ChannelValue>(contract: ChannelContract<Up, Down>,
  open: (channel: ObjectChannel<Up, Down>) => void | Promise<void>): ChannelContribution {
  return { contract, open: channel => open(channel as unknown as ObjectChannel<Up, Down>) };
}
export type { ChannelEnd };
