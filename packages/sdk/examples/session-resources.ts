import type { PluginContext, ResourceRef, ObjectReader, ToolSession } from "@asterism/sdk/runtime";
import { CreateCounter, ChangeCount } from "./counter-contract.ts";

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

/** 公开动作由目标资源执行，调用者不取得对方的私有状态或提交门面。 */
export async function changeCounter(plugin: PluginContext, resource: ResourceRef, amount: number, signal: AbortSignal) {
  await plugin.session(resource.sessionId).invoke(ChangeCount, resource, { amount }, { signal });
}

/** 类型反例：通用后台动作属于执行门面，读取和模型工具的受约束门面保持各自能力。 */
export function invalidActions(plugin: PluginContext, resource: ResourceRef, reader: ObjectReader, tool: ToolSession) {
  // @ts-expect-error 动作输入由契约推导。
  void plugin.session(resource.sessionId).invoke(ChangeCount, resource, { amount: "one" });
  // @ts-expect-error 创建契约不作为资源动作调用。
  void plugin.session(resource.sessionId).invoke(CreateCounter, resource, { title: "Counter" });
  // @ts-expect-error 只读会话门面没有动作调用能力。
  void reader.session.invoke(ChangeCount, resource, { amount: 1 });
  // @ts-expect-error 模型工具作用域未提供任意资源动作调用能力。
  void tool.invoke(ChangeCount, resource, { amount: 1 });
}
