import { z } from "zod";
import {
  pluginNamespace, ReadResourceActivities, ResourceActivitiesChanged, ResourceNoticeRaised,
  type ResourceActivity,
} from "@asterism-app/sdk/contracts";
import { defineModule, type ExecutionServices, type ObjectExecutor } from "@asterism-app/sdk/runtime";
import type { RendererModule, RendererPrepareContext } from "@asterism-app/sdk/renderer";

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

/** One scope covers the whole batch; result notification is an explicit, separate decision. */
export async function downloadFiles(execution: ExecutionServices, object: ObjectExecutor,
  urls: readonly string[], signal?: AbortSignal): Promise<ArrayBuffer[]> {
  const files = await execution.withActivity(object.ref, async ({ signal, progress }) => {
    const downloaded: ArrayBuffer[] = [];
    progress(null);
    for (const url of urls) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
      downloaded.push(await response.arrayBuffer());
      progress(downloaded.length / urls.length);
    }
    signal.throwIfAborted();
    return downloaded;
  }, { signal });
  // A rejected or cancelled scope never reaches this success notification.
  object.events.publish(ResourceNoticeRaised, { title: "Downloads ready", kind: "success" });
  return files;
}

/** Invoke on each connection, including reconnect: events invalidate, while the call reads live state. */
export async function observeActivities({ calls, events, signal }: RendererPrepareContext,
  receive: (activities: readonly ResourceActivity[]) => void) {
  const read = async () => receive(await calls.invoke(ReadResourceActivities, {}, { signal }));
  const subscription = events.subscribe(ResourceActivitiesChanged, { delivery: "latest", signal }, read);
  await subscription.ready;
  await read();
  return subscription;
}

export let activities: readonly ResourceActivity[] = [];
export const renderer: RendererModule = {
  resources: [], cards: [], tools: [],
  async prepare(context) {
    const subscription = context.events.subscribe(Progress, { delivery: "latest" }, event => {
      const job: string = event.data.job;
      void job;
    });
    await subscription.ready;
    await observeActivities(context, snapshot => { activities = snapshot; });
  },
};
