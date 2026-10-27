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
/** Source conditions filter only the host envelope; they neither interpret domain payloads nor grant resource operation permissions. */
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
  /** Deliver immediately after synchronous validation, without waiting for consumption or rolling back with the transaction; publish after a successful commit when effects must be confirmed. */
  publish<I, D extends Json>(contract: EventContract<I, D>, data: NoInfer<I> & Json): void;
}
export interface PluginEvents extends EventSubscriber, EventPublisher {}

/** Public event published by the application itself after a session title actually changes, with no plugin or resource source. */
export const SessionTitleChanged = defineEvent("asterism/session-title", {
  schema: z.strictObject({ sessionId: z.string(), title: z.string() }),
  source: "host",
  semantics: { kind: "snapshot", key: ["sessionId"] },
});

/** Transient changes to the current resource set; used to release UI state across sessions. */
export const ResourcePresenceChanged = defineEvent("asterism/resource-presence", {
  schema: z.strictObject({
    sessionId: z.string(),
    appeared: z.array(z.string()),
    disappeared: z.array(z.string()),
  }),
  source: "host",
  semantics: { kind: "occurrence" },
});

/** Each publication fully replaces resource status; running remains visible, while other states are consumed when the session is viewed. */
export const ResourceStatusChanged = defineEvent("asterism/resource-status", {
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
