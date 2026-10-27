import type { PluginContext, ResourceRef, ObjectReader, ToolSession } from "@asterism/sdk/runtime";
import { CreateCounter, ChangeCount } from "./counter-contract.ts";

/** Callers provide public creation input, and resource providers handle initialization; the return value contains only identity. */
export async function createCounter(plugin: PluginContext, sessionId: string, receiver: ResourceRef, signal: AbortSignal) {
  const session = plugin.session(sessionId);
  const resource = await session.create(CreateCounter, { title: "Counter" }, { signal, linkTo: receiver });
  return resource;
}

/** References must belong to the bound session; removing a busy object fails explicitly without implicit cancellation. */
export function removeCounter(plugin: PluginContext, resource: ResourceRef) {
  plugin.session(resource.sessionId).remove(resource);
}

/** Enumerating summaries neither switches the current view nor loads history. */
export function sessions(plugin: PluginContext) {
  return plugin.sessions.list();
}

/** Public actions are executed by the target resource; callers do not receive its private state or commit facade. */
export async function changeCounter(plugin: PluginContext, resource: ResourceRef, amount: number, signal: AbortSignal) {
  await plugin.session(resource.sessionId).invoke(ChangeCount, resource, { amount }, { signal });
}

/** Type counterexamples: generic backend actions belong to the execution facade; read facades and constrained model tool facades retain their respective capabilities. */
export function invalidActions(plugin: PluginContext, resource: ResourceRef, reader: ObjectReader, tool: ToolSession) {
  // @ts-expect-error Action input is inferred from the contract.
  void plugin.session(resource.sessionId).invoke(ChangeCount, resource, { amount: "one" });
  // @ts-expect-error Creation contracts cannot be invoked as resource actions.
  void plugin.session(resource.sessionId).invoke(CreateCounter, resource, { title: "Counter" });
  // @ts-expect-error The read-only session facade cannot invoke actions.
  void reader.session.invoke(ChangeCount, resource, { amount: 1 });
  // @ts-expect-error The model tool scope does not provide arbitrary resource action invocation.
  void tool.invoke(ChangeCount, resource, { amount: 1 });
}
