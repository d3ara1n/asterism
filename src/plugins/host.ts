import type { ActionContract, CreationContract, DataContract, Json, ResourceRef, ResourceCreationResult, SessionDirectory } from "@atelier/sdk/contracts";
import type { ResourceActionOptions, ResourceCreationOptions, ToolCaller } from "@atelier/sdk/runtime";
import type { NewNode, SessionNode } from "../shared/session.ts";
import type { FoldedObject, FoldedState } from "../session/fold.ts";
import type { AgentCapabilities, ToolPolicy } from "../execution/capabilities.ts";
import type { ContextFile } from "../resources/contract.ts";
import type { ContentLease } from "../runtime/content-store.ts";
import type { NodeView } from "../session/view.ts";

/** 宿主内部的存储与执行接口；插件只接收 SDK 门面。 */
export interface SessionHostWriter {
  append(node: NewNode): string;
  nodes(): SessionNode[];
}
export interface SessionHost {
  list: SessionDirectory["list"];
  create(sessionId: string, contract: CreationContract<unknown>, input: Json, options: ResourceCreationOptions & { owner: string; check(): void }): Promise<ResourceCreationResult>;
  invoke(sessionId: string, contract: ActionContract<unknown>, target: ResourceRef, input: Json, options: ResourceActionOptions & { owner: string; check(): void }): Promise<void>;
  link(sessionId: string, receiver: ResourceRef, resource: ResourceRef, linked: boolean): void;
  remove(sessionId: string, resource: ResourceRef): void;
  view(sessionId: string): NodeView;
  sequences(sessionId: string, nodes: readonly SessionNode[]): number[];
  timeline(sessionId: string): SessionNode[];
  workbench(sessionId: string): FoldedState;
  title(sessionId: string): string;
  setTitle(sessionId: string, text: string): void;
  commit<T>(sessionId: string, work: (writer: SessionHostWriter) => T, objectId?: string): T;
  /** 会话内除 objectId 外没有在途活动；用于显式游标选择前的收束检查。 */
  idle(sessionId: string, objectId?: string): boolean;
  progressChanged(sessionId: string): void;
  viewChanged(sessionId: string, objectId: string): void;
  linked(sessionId: string, objectId: string): FoldedObject[];
  capabilities(linked: readonly FoldedObject[], policy: ToolPolicy, caller?: ToolCaller): AgentCapabilities;
  context(linked: readonly FoldedObject[]): Promise<ContextFile[]>;
}
export interface CatalogHost {
  get<T extends Json>(contract: DataContract<T>): T | null;
}
export interface ObjectScope {
  active: boolean;
  content?: ContentLease;
  provisional?: boolean;
  /** 宿主已授权的工具执行，仅在调用期间允许提交捕获对象的数据。 */
  execution?: boolean;
  before?: () => void;
}
