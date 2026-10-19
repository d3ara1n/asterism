import type { PluginContext, ResourceRef } from "@atelier/sdk/runtime";
import { CreateCounter } from "./counter-contract.ts";

/** 调用者填写公开创建输入，资源提供方负责初始化；返回值只有身份。 */
export async function createCounter(plugin: PluginContext, sessionId: string, receiver: ResourceRef, signal: AbortSignal) {
  const session = plugin.session(sessionId);
  const resource = await session.create(CreateCounter, { title: "Counter" }, { signal, linkTo: receiver });
  return resource;
}

/** 引用必须属于绑定会话；移除忙碌对象明确失败，不隐式取消。 */
export function removeCounter(plugin: PluginContext, resource: ResourceRef) {
  plugin.session(resource.sessionId).remove(resource);
}

/** 枚举摘要不切换当前视图，不加载历史。 */
export function sessions(plugin: PluginContext) {
  return plugin.sessions.list();
}
