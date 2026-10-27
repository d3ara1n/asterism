import { ResourceStatusChanged, type ResourceStatus } from "@asterism-app/sdk/contracts";
import type { ObjectExecutor, PluginContext } from "@asterism-app/sdk/runtime";
import { Progress } from "../examples/events.ts";

export function invalidEvents(plugin: PluginContext, object: ObjectExecutor) {
  plugin.ipc.events.subscribe(Progress, { delivery: "latest" }, event => {
    // @ts-expect-error The domain payload does not contain fields from other contracts.
    event.data.title;
  });
  // @ts-expect-error Publish parameters are inferred from the contract.
  object.events.publish(Progress, { job: "file", completed: "ten", total: 100 });
  // @ts-expect-error Status markers do not provide reset or retraction.
  object.events.publish(ResourceStatusChanged, { title: "Download", status: "reset" });
  // @ts-expect-error Progress belongs only to running; terminal states fully replace the running state.
  const invalid: ResourceStatus = { title: "Download", status: "completed", progress: { value: 1 } };
  void invalid;
}
