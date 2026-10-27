import { z } from "zod";
import { pluginNamespace, ResourceStatusChanged } from "@asterism/sdk/contracts";
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
  });
  return { events: [Progress] };
});
export function report(object: ObjectExecutor): void {
  object.events.publish(Progress, { job: "file", completed: 10, total: 100 });
}
/** Public status is registered by the host; plugins publish through their own resource handles. */
export function reportStatus(object: ObjectExecutor): void {
  object.events.publish(ResourceStatusChanged, { title: "Download", status: "running" });
  object.events.publish(ResourceStatusChanged, { title: "Download", status: "running", progress: { value: 0.6 } });
  object.events.publish(ResourceStatusChanged, { title: "Download", status: "completed" });
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
