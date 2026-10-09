import type { Json } from "../shared/json.ts";
import type { DataContract, Presentation } from "../shared/presentation.ts";
import { present } from "../shared/presentation.ts";
import type { ResourceContract } from "../shared/module-contract.ts";
import type { LiveBlock } from "../shared/session.ts";
import type { FoldedObject } from "../session/fold.ts";

export interface ContextFile { file: string; text: string }
export interface ResourceCommandContext { sessionId: string; resource: FoldedObject }
/**
 * 资源控制器：资源卡片的行为入口。行为属于资源自身，会话只路由命令并记录其事件。
 * before 在资源提交其事件的同一事务内先执行，供组合入口（如首页）原子创建会话与对象。
 */
export interface ResourceController {
  /** 校验创建输入（可异步读取配置或文件系统），结果再交给 create。 */
  prepareCreate?(input: unknown): Promise<Json>;
  /** 在创建事务内执行：返回标题与写入创建事件的不可变资源数据，可同时保存私有状态。 */
  create?(sessionId: string, objectId: string, input: Json): { title: string; data?: { [key: string]: Json } };
  execute?(context: ResourceCommandContext, command: unknown, before?: () => void): Promise<void>;
  /** 正在活动的对象与仅运行时存在的输出；会话回溯前据此判断 settled。 */
  activity?(sessionId: string): { running: string[]; live: LiveBlock[] };
  release?(sessionId: string, objectId: string): Promise<void>;
  /** 本对象作为链接终点时，向它描述被链接资源的可用工具。 */
  linkTools?(sessionId: string, objectId: string, resource: FoldedObject): Json;
  close?(): Promise<void>;
}
/** 后台资源 adapter 的擦除接口；不会跨进程传递函数。 */
export interface ResourceBackend {
  kind: string;
  project(resource: FoldedObject): Presentation;
  inspect(resource: FoldedObject): Promise<Json>;
  context(resource: FoldedObject): Promise<ContextFile[]>;
  controller?: ResourceController;
}
export function implementResource<S extends Json, V extends Json>(contract: ResourceContract<S>, view: DataContract<V>, implementation: {
  project(state: S, resource: FoldedObject): V;
  inspect(state: S, resource: FoldedObject): Promise<Json>;
  context?: (state: S, resource: FoldedObject) => Promise<ContextFile[]>;
  controller?: ResourceController;
}): ResourceBackend {
  return {
    kind: contract.kind,
    project: resource => present(view, implementation.project(contract.stateSchema.parse(resource.data), resource)),
    inspect: resource => implementation.inspect(contract.stateSchema.parse(resource.data), resource),
    context: resource => implementation.context?.(contract.stateSchema.parse(resource.data), resource) ?? Promise.resolve([]),
    ...(implementation.controller ? { controller: implementation.controller } : {}),
  };
}
