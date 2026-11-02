import type { FileServices } from "@asterism-app/sdk/runtime";
import type { ResourceRegistry } from "../../resources/registry.ts";
import type { PluginHostServices } from "../loader.ts";
import type { RunGroup } from "../lifecycle.ts";

/** Routes self-contained file addresses; no reference registration, content lease, or consumer authorization is involved. */
export function bindFiles(host: PluginHostServices, resources: () => ResourceRegistry, runs: RunGroup,
  lifetime: AbortSignal, checkAvailable: () => void): FileServices {
  const lookup = { refOf: (id: string) => host.refOf(id), workbench: (sessionId: string) => host.sessions.workbench(sessionId) };
  return {
    open(ref, options) {
      checkAvailable();
      return runs.iterate(async function* (signal) {
        yield* resources().openFile(ref, lookup, signal);
      }, options?.signal ?? lifetime, { rejectOnAbort: true });
    },
  };
}
