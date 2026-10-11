import type { DataContract, Json } from "@atelier/sdk/contracts";
import type { NewNode, SessionNode, BlockCompletion } from "../shared/session.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { AgentCapabilities, ToolPolicy } from "../execution/capabilities.ts";
import type { ContextFile } from "../resources/contract.ts";

/** 宿主内部的存储与执行接口；插件只接收 SDK 门面。 */
export interface SessionHostWriter {
  append(node: NewNode): string;
  completeBlock(blockId: string, completion: BlockCompletion): void;
  nodes(): SessionNode[];
}
export interface SessionHost {
  path(sessionId: string): SessionNode[];
  nodes(sessionId: string): SessionNode[];
  title(sessionId: string): string;
  proposeTitle(sessionId: string, text: string, expected: string): boolean;
  commit<T>(sessionId: string, work: (writer: SessionHostWriter) => T): T;
  resume(sessionId: string, objectId?: string): void;
  canResume(sessionId: string, objectId?: string): boolean;
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
  provisional?: boolean;
  /** 宿主已授权的工具执行，仅在调用期间允许提交捕获对象的数据。 */
  execution?: boolean;
  before?: () => void;
}
