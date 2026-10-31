import { createReadStream } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { defineCreation, defineEvent, fileRefSchema, pluginNamespace, type FileRef } from "@asterism-app/sdk/contracts";
import { defineModule, definePlugin, implementCreation, implementResource, type PluginContext } from "@asterism-app/sdk/runtime";

const namespace = pluginNamespace("example.file-source");
const Folder = namespace.resource("folder", z.object({ path: z.string() }));
const CreateFolder = defineCreation(Folder, { id: namespace.name("create"), schema: Folder.stateSchema });
const FolderView = namespace.data("view", Folder.stateSchema);
export const FileOffered = defineEvent(namespace.name("file-offered"), {
  schema: z.object({ file: fileRefSchema, filename: z.string() }),
  source: "plugin", semantics: { kind: "occurrence" },
});

export default definePlugin({ namespace, modules: [defineModule(() => ({
  events: [FileOffered],
  resources: [implementResource(Folder, FolderView, {
    creation: implementCreation(CreateFolder, { create: data => ({ title: "Files", data }) }),
    project: data => data,
    inspect: async data => data,
    async *openFile(data, locator, { signal }) {
      const { path } = z.object({ path: z.string() }).parse(locator);
      yield* createReadStream(join(data.path, path), { signal });
    },
  })],
}))] });

/** Called with the source plugin's context. Publishing does not check the file or read its bytes. */
export function offerFile(plugin: PluginContext, file: FileRef, filename: string) {
  plugin.ipc.events.publish(FileOffered, { file, filename });
}

/** A consuming plugin subscribes to the shared event contract and streams bytes into its own operation. */
export function receiveFiles(plugin: PluginContext, consume: (chunks: AsyncIterable<Uint8Array>, filename: string, signal: AbortSignal) => Promise<void>) {
  return plugin.ipc.events.subscribe(FileOffered, { signal: plugin.lifetime.signal }, async ({ data }, { signal }) => {
    await consume(plugin.files.open(data.file, { signal }), data.filename, signal);
  });
}
