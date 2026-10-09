import { jsonSchema, type Json } from "../shared/json.ts";
import type { Presentation } from "../shared/presentation.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { ContextFile, ResourceBackend, ResourceController } from "./contract.ts";

/** 后台资源 adapter 目录；资源内容投影由对应模块负责。 */
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
    return { contract: { id: "weft.unknown-resource", version: 1 }, data: jsonSchema.parse(resource.data) };
  }

  controller(kind: string): ResourceController | undefined { return this.backends.get(kind)?.controller; }
  controllers(): ResourceController[] { return [...this.backends.values()].flatMap(backend => backend.controller ? [backend.controller] : []); }

  inspect(resource: FoldedObject): Promise<Json> {
    const backend = this.backends.get(resource.kind);
    if (!backend) throw new Error(`Unsupported resource type: ${resource.kind}`);
    return backend.inspect(resource);
  }

  async context(linked: readonly FoldedObject[]): Promise<ContextFile[]> {
    const files = await Promise.all(linked.map(resource => this.backends.get(resource.kind)?.context(resource) ?? []));
    return files.flat();
  }
}
