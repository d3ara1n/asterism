import type { Json } from "../shared/json.ts";
import type { DataContract, Presentation } from "../shared/presentation.ts";
import { present } from "../shared/presentation.ts";
import type { ResourceContract } from "../shared/module-contract.ts";
import type { FoldedObject } from "../session/fold.ts";

export interface ContextFile { file: string; text: string }
/** 后台资源 adapter 的擦除接口；不会跨进程传递函数。 */
export interface ResourceBackend {
  kind: string;
  project(resource: FoldedObject): Presentation;
  inspect(resource: FoldedObject): Promise<Json>;
  context(resource: FoldedObject): Promise<ContextFile[]>;
}
export function implementResource<S extends Json, V extends Json>(contract: ResourceContract<S>, view: DataContract<V>, implementation: {
  project(state: S, resource: FoldedObject): V;
  inspect(state: S, resource: FoldedObject): Promise<Json>;
  context?: (state: S, resource: FoldedObject) => Promise<ContextFile[]>;
}): ResourceBackend {
  return {
    kind: contract.kind,
    project: resource => present(view, implementation.project(contract.stateSchema.parse(resource.data), resource)),
    inspect: resource => implementation.inspect(contract.stateSchema.parse(resource.data), resource),
    context: resource => implementation.context?.(contract.stateSchema.parse(resource.data), resource) ?? Promise.resolve([]),
  };
}
