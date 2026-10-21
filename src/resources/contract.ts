import type { Json, CreationContract, ActionContract } from "@atelier/sdk/contracts";
import type { ParsedCall } from "../plugins/commands.ts";
import type { Presentation } from "@atelier/sdk/contracts";
import type { LiveBlock } from "../shared/session.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { ResourceRef } from "@atelier/sdk/runtime";
import type { ContentLease } from "../runtime/content-store.ts";

export interface ContextFile { file: string; text: string }
export interface ResourceCommandContext { sessionId: string; resource: FoldedObject; signal?: AbortSignal }
/**
 * 资源控制器：资源卡片的行为入口。行为属于资源自身，会话只路由命令并记录其事件。
 * before 在资源提交其事件的同一事务内先执行：重新确认对象仍在当前路径上，
 * 或供组合入口（如首页）原子创建会话与对象；异步准备后也必须执行此检查。
 */
export interface ResourceController {
  creationId?: string;
  creationContract?: CreationContract<unknown>;
  actionContracts?: readonly ActionContract<unknown>[];
  /** 在异步准备前检查当前动作调用链，避免同对象重入等待自身。 */
  assertActionEntry?(objectId: string): void;
  /** 外部准备者按装配顺序执行后，进入资源自己的准备；每次替换按目标 schema 校验。 */
  prepareCommand?(input: ParsedCall, ref: ResourceRef, signal: AbortSignal): Promise<ParsedCall>;
  parseCommand?(input: unknown): ParsedCall;
  /** 校验创建输入（可异步读取配置或文件系统），结果再交给 create。 */
  prepareCreate?(input: unknown, signal?: AbortSignal, content?: ContentLease): Promise<Json>;
  /** 在创建事务内执行：返回标题与写入创建事件的不可变资源数据，可同时保存私有状态。 */
  create?(sessionId: string, objectId: string, input: Json, content?: ContentLease): { title: string; data?: { [key: string]: Json } };
  execute?(context: ResourceCommandContext, command: ParsedCall, before?: () => void): Promise<void>;
  /**
   * running 是仍可能向会话树追加事件的对象 ID，涵盖代理与其他被捕获的资源。
   * 外部状态的持续运行不计入；会话回溯与对象移除据此判断 settled。
   * live 只包含模型的临时输出；活动开始与结束由宿主发布进度通知。
   */
  activity?(sessionId: string): { running: string[]; live: LiveBlock[] };
  /** 本对象作为链接终点时，向它描述被链接资源的可用工具。 */
  linkTools?(sessionId: string, objectId: string, resource: FoldedObject): Json;
  close?(): Promise<void>;
}
/** 后台资源 adapter 的擦除接口；不会跨进程传递函数。 */
export interface ResourceBackend {
  kind: string;
  receivesLinks?: boolean;
  project(resource: FoldedObject): Presentation;
  inspect(resource: FoldedObject): Promise<Json>;
  context(resource: FoldedObject): Promise<ContextFile[]>;
  controller?: ResourceController;
}
