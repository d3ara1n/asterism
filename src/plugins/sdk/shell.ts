import type { ShellServices } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../lifecycle.ts";

/** Bind host shell capabilities to plugin availability and cancellation without occupying session history. */
export function bindShellServices(shell: ShellServices, runs: RunGroup, checkAvailable: () => void): ShellServices {
  const outside = { affectsHistory: false } as const;
  return {
    profiles: {
      get: () => { checkAvailable(); return structuredClone(shell.profiles.get()); },
      list: () => { checkAvailable(); return runs.start(() => shell.profiles.list(), outside).done; },
    },
    inspect: () => { checkAvailable(); return runs.start(() => shell.inspect(), outside).done; },
    execute(cwd, args, options) {
      checkAvailable();
      return runs.start(signal => shell.execute(cwd, args, { ...options, signal }), { ...outside, signal: options.signal }).done;
    },
    // The plugin releases terminals with their owning scope; the host reaps any left at shutdown.
    terminals: { create: (config, events) => { checkAvailable(); return shell.terminals.create(structuredClone(config), events); } },
  };
}
