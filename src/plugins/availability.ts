import type { PluginDiagnostic } from "../shared/plugin-startup.ts";

/** Failure reachability is independent of environment-specific initialization order; combined dependency cycles are valid. */
export class PluginAvailability {
  private readonly failures = new Map<string, PluginDiagnostic>();
  private readonly dependents = new Map<string, string[]>();
  constructor(entries: readonly { id: string; dependencies: readonly string[]; diagnostic?: PluginDiagnostic; unavailable?: boolean }[]) {
    for (const entry of entries) for (const dependency of entry.dependencies) {
      const consumers = this.dependents.get(dependency) ?? [];
      consumers.push(entry.id);
      this.dependents.set(dependency, consumers);
    }
    // Keep direct causes instead of replacing them with a dependent failure.
    for (const entry of entries) if (entry.unavailable || entry.diagnostic)
      this.failures.set(entry.id, entry.diagnostic ?? { stage: "dependency", message: `Plugin ${entry.id} is unavailable.` });
    for (const [id, diagnostic] of [...this.failures]) this.propagate(id, diagnostic);
  }
  get(id: string): PluginDiagnostic | undefined { return this.failures.get(id); }
  fail(id: string, diagnostic: PluginDiagnostic): void {
    if (this.failures.has(id)) return;
    this.propagate(id, diagnostic);
  }
  private propagate(id: string, diagnostic: PluginDiagnostic): void {
    this.failures.set(id, diagnostic);
    const queue = [id];
    for (let index = 0; index < queue.length; index++) {
      const dependency = queue[index]!;
      for (const consumer of this.dependents.get(dependency) ?? []) {
        if (this.failures.has(consumer)) continue;
        this.failures.set(consumer, { stage: "dependency", dependency, message: `Public dependency ${dependency} is unavailable.` });
        queue.push(consumer);
      }
    }
  }
}
