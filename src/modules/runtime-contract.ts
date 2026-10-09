import type { ObjectStore } from "../runtime/storage.ts";
import type { ResourceBackend } from "../resources/contract.ts";
import type { ToolImplementation } from "../tools/contract.ts";

export interface RuntimeModule {
  resources: ResourceBackend[];
  tools: ToolImplementation[];
}
export type RuntimeModuleFactory = (services: { objects: ObjectStore }) => RuntimeModule;
