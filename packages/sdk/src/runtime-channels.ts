import type { ChannelContract, ChannelEnd, ChannelValue } from "./channels.ts";
import type { ObjectReader } from "./objects.ts";

/**
 * 后台持有的通道一端。消息按发送顺序交付；监听注册前到达的消息先缓存，首个监听注册时按序补交。
 * signal 在任一端关闭、对象离开当前集合、插件关闭或连接断开时中止，reason 为 ChannelEnd。
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
  /** 前端打开通道时调用；抛出 PluginApiError 以 unavailable 结束通道。 */
  open(channel: ObjectChannel): void | Promise<void>;
}
export function implementChannel<Up extends ChannelValue, Down extends ChannelValue>(contract: ChannelContract<Up, Down>,
  open: (channel: ObjectChannel<Up, Down>) => void | Promise<void>): ChannelContribution {
  return { contract, open: channel => open(channel as unknown as ObjectChannel<Up, Down>) };
}
export type { ChannelEnd };
