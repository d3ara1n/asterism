import type { PluginContext, ResourceRef, ObjectReader, ToolSession } from "@asterism/sdk/runtime";
import { CreateCounter, ChangeCount } from "../examples/counter-contract.ts";

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
