import type { ObjectStore } from "../runtime/storage.ts";
import type { ConfigurationService } from "../configuration/service.ts";
import type { ModelAdapter } from "../model/contract.ts";
import type { ModelSettings } from "../shared/model.ts";
import type { SessionNode } from "../shared/session.ts";
import type { SessionTree } from "../session/tree.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { AgentCapabilities, ToolPolicy } from "../execution/capabilities.ts";
import type { ContextFile, ResourceBackend } from "../resources/contract.ts";
import type { ResourceStateStore } from "../resources/state.ts";
import type { ToolImplementation } from "../tools/contract.ts";

export interface RuntimeModule {
  resources: ResourceBackend[];
  tools: ToolImplementation[];
}
/** 会话向资源控制器开放的边界：记录事件、事务、通知与按请求边界取用授权。 */
export interface SessionHost {
  tree: SessionTree;
  transaction<T>(work: () => T): T;
  notify(sessionId: string): void;
  progressChanged(sessionId: string): void;
  settled(sessionId: string): boolean;
  /** 路径上以该对象为终点的链接起点。 */
  linked(path: readonly SessionNode[], objectId: string): FoldedObject[];
  capabilities(linked: readonly FoldedObject[], policy: ToolPolicy): AgentCapabilities;
  context(linked: readonly FoldedObject[]): Promise<ContextFile[]>;
}
export interface RuntimeServices {
  objects: ObjectStore;
  state: ResourceStateStore;
  sessions: SessionHost;
  configuration: ConfigurationService;
  adapterFactory?: (settings: ModelSettings) => ModelAdapter;
}
export type RuntimeModuleFactory = (services: RuntimeServices) => RuntimeModule;
