import type { DataContract, Json } from "@atelier/sdk/contracts";
import type { NewNode, SessionNode } from "../shared/session.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { AgentCapabilities, ToolPolicy } from "../execution/capabilities.ts";
import type { ContextFile } from "../resources/contract.ts";
import type { ContentLease } from "../runtime/content-store.ts";

/** 宿主内部的存储与执行接口；插件只接收 SDK 门面。 */
export interface SessionHostWriter {
  append(node: NewNode): string;
  nodes(): SessionNode[];
}
export interface SessionHost {
  path(sessionId: string): SessionNode[];
  nodes(sessionId: string): SessionNode[];
  title(sessionId: string): string;
  setTitle(sessionId: string, text: string): void;
  commit<T>(sessionId: string, work: (writer: SessionHostWriter) => T): T;
  /** 会话内除 objectId 外没有在途活动；用于历史选择前的收束检查。 */
  idle(sessionId: string, objectId?: string): boolean;
  progressChanged(sessionId: string): void;
  linked(path: readonly SessionNode[], objectId: string): FoldedObject[];
  capabilities(linked: readonly FoldedObject[], policy: ToolPolicy): AgentCapabilities;
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
