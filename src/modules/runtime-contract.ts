import type { ObjectStore } from "../runtime/storage.ts";
import type { ConfigurationService } from "../configuration/service.ts";
import type { ModelAdapter } from "../model/contract.ts";
import type { ModelSettings } from "../shared/model.ts";
import type { BlockCompletion, NewNode, SessionNode } from "../shared/session.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { AgentCapabilities, ToolPolicy } from "../execution/capabilities.ts";
import type { ContextFile, ResourceBackend } from "../resources/contract.ts";
import type { ResourceStateStore } from "../resources/state.ts";
import type { ToolImplementation } from "../tools/contract.ts";

export interface RuntimeModule {
  resources: ResourceBackend[];
  tools: ToolImplementation[];
}
/** 只在会话的同步提交事务中使用；节点身份、父指针、游标与续接位置由会话管理。 */
export interface SessionWriter {
  append(node: NewNode): string;
  completeBlock(blockId: string, completion: BlockCompletion): void;
  continuation(): SessionNode[];
}
/** 会话向资源控制器开放的边界：提交成型记录、读取路径与按请求边界取用授权。 */
export interface SessionHost {
  path(sessionId: string): SessionNode[];
  /** 回调内不可异步等待；记录和资源私有状态同事务提交，通知在提交后发布。 */
  commit<T>(sessionId: string, work: (writer: SessionWriter) => T): T;
  progressChanged(sessionId: string): void;
  /** 当前资源内容变化使持久视图失效，不追加事件或移动时间轴。 */
  resourceChanged(sessionId: string): void;
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
