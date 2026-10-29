import { jsonSchema, missingResourceContract, pluginOf, type Json, type Presentation } from "@asterism-app/sdk/contracts";
import type { ContextFile } from "@asterism-app/sdk/runtime";
import type { FoldedObject } from "../session/fold.ts";
import type { ResourceBackend, ResourceController } from "./contract.ts";
import { SessionError } from "../session/tree.ts";
import { templateMessages } from "../shared/template-messages.ts";

/** Backend resource adapter catalog; corresponding modules own resource content projection. */
export class ResourceRegistry {
  private readonly backends: ReadonlyMap<string, ResourceBackend>;
  constructor(backends: readonly ResourceBackend[]) {
    const entries = new Map<string, ResourceBackend>();
    for (const backend of backends) {
      if (entries.has(backend.kind)) throw new Error(`Duplicate resource type: ${backend.kind}`);
      entries.set(backend.kind, backend);
    }
    this.backends = entries;
  }

  project(resource: FoldedObject): Presentation {
    const backend = this.backends.get(resource.kind);
    if (backend) return backend.project(resource);
    return { contract: { ...missingResourceContract }, data: { plugin: pluginOf(resource.kind), kind: resource.kind, data: jsonSchema.parse(resource.data) } };
  }

  has(kind: string): boolean { return this.backends.has(kind); }
  card(kind: string) { return this.backends.get(kind)?.card; }
  template(kind: string) { return this.backends.get(kind)?.template; }
  validateTemplate(kind: string, data: Json, current: readonly { contract: string; data: Json }[]): void {
    const backend = this.backends.get(kind);
    if (!backend) throw new SessionError("unavailable", `Resource type ${kind} is unavailable.`, templateMessages.unavailable);
    if (!backend.template) throw new SessionError("invalid_request", `Resource type ${kind} does not support templates.`, templateMessages.unsupported);
    try {
      backend.validateState?.(data);
      for (const entry of current) {
        const contract = backend.template.current.find(contract => contract.id === entry.contract);
        if (!contract || !contract.schema.safeParse(entry.data).success)
          throw new Error(`Invalid template data contract: ${entry.contract}.`);
      }
    }
    catch { throw new SessionError("invalid_request", `Saved state for ${kind} is invalid.`, templateMessages.invalidData); }
  }
  disposalWarning(resource: FoldedObject) { return this.backends.get(resource.kind)?.disposalWarning?.(resource) ?? null; }
  receivesLinks(kind: string): boolean { return this.backends.get(kind)?.receivesLinks === true; }
  controller(kind: string): ResourceController | undefined { return this.backends.get(kind)?.controller; }
  controllers(): ResourceController[] { return [...this.backends.values()].flatMap(backend => backend.controller ? [backend.controller] : []); }

  inspect(resource: FoldedObject): Promise<Json> {
    const backend = this.backends.get(resource.kind);
    if (!backend) return Promise.resolve({ type: resource.kind, title: resource.title, available: false,
      error: { code: "implementation_missing", message: `The plugin providing ${resource.kind} is not installed or is disabled. Ask the user to enable it; this resource cannot be operated until then.` } });
    return backend.inspect(resource);
  }

  async context(linked: readonly FoldedObject[]): Promise<ContextFile[]> {
    const files = await Promise.allSettled(linked.map(async resource => this.backends.get(resource.kind)?.context(resource) ?? []));
    const failure = files.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    return files.flatMap(result => result.status === "fulfilled" ? result.value : []);
  }
}
