import { z } from "zod";
import type { Json } from "./json.ts";
import type { Source } from "./workspace.ts";
import { uiTextSchema } from "./i18n.ts";

export type EventSourceKind = "plugin" | "resource" | "any" | "host";
export interface EventEnvelope<D extends Json = Json> {
  readonly contract: { readonly id: string };
  readonly emittedAt: string;
  readonly source: Source;
  readonly data: D;
}
export type EventSemantics = { readonly kind: "occurrence" } | { readonly kind: "snapshot"; readonly key: readonly string[] };
export interface EventContract<I = unknown, D extends Json = Json> {
  readonly id: string;
  readonly schema: z.ZodType<D, I>;
  readonly source: EventSourceKind;
  readonly semantics: EventSemantics;
}
export interface EventDefinition<I, D extends Json> {
  schema: z.ZodType<D, I>;
  source: EventSourceKind;
  semantics: { kind: "occurrence" } | { kind: "snapshot"; key: readonly Extract<keyof D, string>[] };
}
export function defineEvent<I, D extends Json>(id: string, definition: EventDefinition<I, D>): EventContract<I, D> {
  const semantics = definition.semantics.kind === "snapshot"
    ? Object.freeze({ kind: "snapshot" as const, key: Object.freeze([...definition.semantics.key]) })
    : Object.freeze({ kind: "occurrence" as const });
  return Object.freeze({ id, schema: definition.schema, source: definition.source, semantics });
}
/** 来源条件只筛选宿主信封；不解释领域载荷，不授予资源操作权限。 */
export interface EventFilter { plugin?: string; sessionId?: string; resourceId?: string; resourceKind?: string }
export interface EventSubscribeOptions {
  delivery?: "all" | "latest";
  source?: EventFilter;
  signal?: AbortSignal;
}
export interface SubscriptionEnd {
  readonly reason: "closed" | "aborted" | "unavailable" | "invalid_contract" | "consumer_failed" | "disconnected";
  readonly message?: string;
}
export interface EventSubscription {
  readonly ready: Promise<void>;
  readonly closed: Promise<SubscriptionEnd>;
  close(): void;
}
export type EventHandler<D extends Json> = (event: EventEnvelope<D>, context: { signal: AbortSignal }) => void | Promise<void>;
export interface EventSubscriber {
  subscribe<I, D extends Json>(contract: EventContract<I, D>, options: EventSubscribeOptions, handler: EventHandler<NoInfer<D>>): EventSubscription;
}
export interface EventPublisher {
  /** 同步校验后立即投递，不等待消费完成，也不随事务回滚；需要确保已生效时在成功提交后发布。 */
  publish<I, D extends Json>(contract: EventContract<I, D>, data: NoInfer<I> & Json): void;
}
export interface PluginEvents extends EventSubscriber, EventPublisher {}

/** 软件本身发布的公共事件：会话标题实际变化后发出，无插件与资源来源。 */
export const SessionTitleChanged = defineEvent("atelier/session-title", {
  schema: z.strictObject({ sessionId: z.string(), title: z.string() }),
  source: "host",
  semantics: { kind: "snapshot", key: ["sessionId"] },
});

/** 每次发布完整替换资源状态；running 持续展示，其他状态在查看会话时消费。 */
export const ResourceStatusChanged = defineEvent("atelier/resource-status", {
  schema: z.discriminatedUnion("status", [
    z.strictObject({
      title: uiTextSchema,
      status: z.literal("running"),
      progress: z.strictObject({ value: z.number().min(0).max(1) }).optional(),
    }),
    z.strictObject({
      title: uiTextSchema,
      status: z.enum(["failed", "awaiting", "completed"]),
    }),
  ]),
  source: "resource",
  semantics: { kind: "snapshot", key: [] },
});
export type ResourceStatus = z.infer<typeof ResourceStatusChanged.schema>;
