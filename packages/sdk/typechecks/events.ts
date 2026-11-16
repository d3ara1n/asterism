import {
  ReadResourceActivities, ResourceNoticeRaised, type ResourceActivity, type ResourceNotice,
} from "@asterism-app/sdk/contracts";
import type { ExecutionServices, ObjectExecutor, PluginContext } from "@asterism-app/sdk/runtime";
import { Progress } from "../examples/events.ts";

export function invalidEvents(plugin: PluginContext, object: ObjectExecutor) {
  plugin.ipc.events.subscribe(Progress, { delivery: "latest" }, event => {
    // @ts-expect-error The domain payload does not contain fields from other contracts.
    event.data.title;
  });
  // @ts-expect-error Publish parameters are inferred from the contract.
  object.events.publish(Progress, { job: "file", completed: "ten", total: 100 });
  // @ts-expect-error Running work is an activity, not a notice kind.
  object.events.publish(ResourceNoticeRaised, { title: "Download", kind: "running" });
  // @ts-expect-error Notices do not carry activity progress.
  const invalid: ResourceNotice = { title: "Download", kind: "success", progress: { value: 1 } };
  void invalid;
  // @ts-expect-error Reading the live snapshot is plugin-scoped, not object-scoped.
  void plugin.ipc.calls.invoke(ReadResourceActivities, {}, { object: object.ref });
}

export async function activityTypes(execution: ExecutionServices, plugin: PluginContext, object: ObjectExecutor) {
  const activities: ResourceActivity[] = await plugin.ipc.calls.invoke(ReadResourceActivities, {}, {});
  for (const activity of activities) {
    const value: number | undefined = activity.progress?.value;
    // @ts-expect-error An activity is a live scope, not a terminal status marker.
    activity.status;
    void value;
  }
  const count: number = await execution.withActivity(object.ref, async ({ signal, progress }) => {
    signal.throwIfAborted();
    progress(0.5);
    progress(null);
    // @ts-expect-error Progress is a fraction or null, not a progress object.
    progress({ value: 0.5 });
    return 1;
  });
  return count;
}
