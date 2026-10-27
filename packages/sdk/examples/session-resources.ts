import type { PluginContext, ResourceRef, ObjectReader } from "@asterism-app/sdk/runtime";
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

/** Read a fresh snapshot for each external event to follow the receiver's current direct links. */
export function linkedResources(object: ObjectReader) {
  return object.session.snapshot().resources.linkedTo(object.ref);
}

/** Public actions are executed by the target resource; callers do not receive its private state or commit facade. */
export async function changeCounter(plugin: PluginContext, resource: ResourceRef, amount: number, signal: AbortSignal) {
  await plugin.session(resource.sessionId).invoke(ChangeCount, resource, { amount }, { signal });
}
