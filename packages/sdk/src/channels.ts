import { contractReferenceSchema } from "./presentation.ts";

/** 通道载荷：结构化克隆可传递的 JSON 值与字节，可互相嵌套。宿主不逐帧校验。 */
export type ChannelValue = null | boolean | number | string | Uint8Array | readonly ChannelValue[] | { readonly [key: string]: ChannelValue };
/** 通道结束原因：closed 为任一端主动关闭；removed 为对象离开当前集合；unavailable 为契约或对象不可用；disconnected 为连接断开。 */
export type ChannelEnd = { reason: "closed" | "removed" | "unavailable" | "disconnected"; message?: string };

/**
 * 对象级双工通道契约：前端打开、后台按契约路由到对象所属插件。
 * Up 为前端发往后台的消息，Down 为后台发往前端的消息；两端按序交付，不逐帧确认。
 */
export interface ChannelContract<Up extends ChannelValue = ChannelValue, Down extends ChannelValue = ChannelValue> {
  readonly id: string;
  readonly kind: "channel";
  /** 仅用于类型推导。 */
  readonly __types?: { up: Up; down: Down };
}
export function defineChannel<Up extends ChannelValue, Down extends ChannelValue>(id: string): ChannelContract<Up, Down> {
  return Object.freeze({ ...contractReferenceSchema.parse({ id }), kind: "channel" as const });
}
