import { z } from "zod";
import { pluginNamespace, ResourceStatusChanged, type ResourceStatus } from "@asterism/sdk/contracts";
import { defineModule, type ObjectExecutor } from "@asterism/sdk/runtime";
import type { RendererModule } from "@asterism/sdk/renderer";

const ns = pluginNamespace("example.downloads");
export const Progress = ns.event("progress", {
  schema: z.strictObject({ job: z.string(), completed: z.number(), total: z.number() }),
  source: "resource",
  semantics: { kind: "snapshot", key: ["job"] },
});
export const backend = defineModule(plugin => {
  plugin.ipc.events.subscribe(Progress, { delivery: "latest" }, event => {
    const completed: number = event.data.completed;
    plugin.log.info(`Downloaded ${completed} bytes from ${event.source?.resource?.id}.`);
    // @ts-expect-error The domain payload does not contain fields from other contracts.
    event.data.title;
  });
  return { events: [Progress] };
});
export function report(object: ObjectExecutor): void {
  object.events.publish(Progress, { job: "file", completed: 10, total: 100 });
  // @ts-expect-error Publish parameters are inferred from the contract.
  object.events.publish(Progress, { job: "file", completed: "ten", total: 100 });
}
/** Public status is registered by the host; plugins publish only through their own resource handles. Part of host API 8.0. */
export function reportStatus(object: ObjectExecutor): void {
  object.events.publish(ResourceStatusChanged, { title: "Download", status: "running" });
  object.events.publish(ResourceStatusChanged, { title: "Download", status: "running", progress: { value: 0.6 } });
  object.events.publish(ResourceStatusChanged, { title: "Download", status: "completed" });
  // @ts-expect-error Status markers do not provide reset or retraction.
  object.events.publish(ResourceStatusChanged, { title: "Download", status: "reset" });
  // @ts-expect-error Progress belongs only to running; terminal states fully replace the running state.
  const invalid: ResourceStatus = { title: "Download", status: "completed", progress: { value: 1 } };
  void invalid;
}
export const renderer: RendererModule = {
  resources: [], cards: [], tools: [],
  async prepare({ events }) {
    const subscription = events.subscribe(Progress, { delivery: "latest" }, event => {
      const job: string = event.data.job;
      void job;
    });
    await subscription.ready;
  },
};
