import { z } from "zod";
import { pluginNamespace } from "@atelier/sdk/contracts";
import { defineModule, type ObjectExecutor } from "@atelier/sdk/runtime";
import type { RendererModule } from "@atelier/sdk/renderer";

const ns = pluginNamespace("example.downloads");
export const Progress = ns.event("progress", {
  schema: z.strictObject({ job: z.string(), completed: z.number(), total: z.number() }),
  source: "resource",
  semantics: { kind: "snapshot", key: ["job"] },
});
export const backend = defineModule(plugin => {
  plugin.ipc.events.subscribe(Progress, { delivery: "latest" }, event => {
    const completed: number = event.data.completed;
    plugin.log.info(`Downloaded ${completed} bytes from ${event.source.resource?.id}.`);
    // @ts-expect-error 领域载荷不含其他契约的字段。
    event.data.title;
  });
  return { events: [Progress] };
});
export function report(object: ObjectExecutor): void {
  object.events.publish(Progress, { job: "file", completed: 10, total: 100 });
  // @ts-expect-error 发布参数由契约推导。
  object.events.publish(Progress, { job: "file", completed: "ten", total: 100 });
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
