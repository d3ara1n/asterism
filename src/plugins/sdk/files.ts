import { fileRefSchema } from "@asterism-app/sdk/contracts";
import { PluginApiError, type FileServices } from "@asterism-app/sdk/runtime";
import type { ResourceRegistry } from "../../resources/registry.ts";
import type { PluginHostServices } from "../loader.ts";
import type { RunGroup } from "../lifecycle.ts";

/** Routes self-contained file addresses; no reference registration, content lease, or consumer authorization is involved. */
export function bindFiles(host: PluginHostServices, resources: () => ResourceRegistry, runs: RunGroup,
  lifetime: AbortSignal, checkAvailable: () => void): FileServices {
  return {
    open(ref, options) {
      checkAvailable();
      const parsed = fileRefSchema.safeParse(ref);
      if (!parsed.success) throw new PluginApiError("invalid_argument", `Invalid file reference: ${parsed.error.message}`);
      const { source, locator } = parsed.data;
      return runs.iterate(async function* (signal) {
        signal.throwIfAborted();
        const actual = host.refOf(source.id);
        if (!actual || actual.sessionId !== source.sessionId || actual.kind !== source.kind)
          throw new PluginApiError("not_found", "The file source resource does not exist.", "file_source_not_found");
        const resource = host.sessions.workbench(source.sessionId).objects.find(item => item.id === source.id);
        if (!resource) throw new PluginApiError("not_found", "The file source resource does not exist.", "file_source_not_found");
        const provider = resources().fileProvider(source.kind);
        if (!provider) throw new PluginApiError("unavailable", "The source resource has no available file provider.", "file_provider_unavailable");
        yield* provider(resource, locator, signal);
      }, options?.signal ?? lifetime, { rejectOnAbort: true });
    },
  };
}
