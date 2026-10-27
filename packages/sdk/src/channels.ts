import { contractReferenceSchema } from "./presentation.ts";

/** Channel payloads: JSON values and bytes supported by structured cloning, with arbitrary nesting. The host does not validate each frame. */
export type ChannelValue = null | boolean | number | string | Uint8Array | readonly ChannelValue[] | { readonly [key: string]: ChannelValue };
/** Channel end reasons: closed means either end closed it explicitly; removed means the object left the current set; unavailable means the contract or object is unavailable; disconnected means the connection was lost. */
export type ChannelEnd = { reason: "closed" | "removed" | "unavailable" | "disconnected"; message?: string };

/**
 * Object-level duplex channel contract: opened by the frontend and routed by the backend to the object's owning plugin according to the contract.
 * Up carries frontend-to-backend messages, and Down carries backend-to-frontend messages; both ends deliver in order without per-frame acknowledgments.
 */
export interface ChannelContract<Up extends ChannelValue = ChannelValue, Down extends ChannelValue = ChannelValue> {
  readonly id: string;
  readonly kind: "channel";
  /** For type inference only. */
  readonly __types?: { up: Up; down: Down };
}
export function defineChannel<Up extends ChannelValue, Down extends ChannelValue>(id: string): ChannelContract<Up, Down> {
  return Object.freeze({ ...contractReferenceSchema.parse({ id }), kind: "channel" as const });
}
