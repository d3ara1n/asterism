import { belongsTo, jsonSchema, type EventContract, type EventEnvelope, type EventFilter, type Source,
  type EventSubscribeOptions, type Json, type SubscriptionEnd } from "@asterism/sdk/contracts";
import { PluginApiError } from "@asterism/sdk/runtime";
import { deepFreeze } from "../shared/immutable.ts";
import { EventQueue, eventKey } from "../shared/event-queue.ts";
import { eventFilterSchema } from "../shared/plugin-events.ts";

export interface EventPacket {
  readonly event: EventEnvelope;
  /** Raw JSON input; receivers decode across processes with the same contract so transforming schemas are not applied twice. */
  readonly wire: EventEnvelope;
}
interface Listener { filter?: EventFilter; queue: EventQueue<EventPacket> }
const matches = (source: Source, filter?: EventFilter) => !filter || source !== null &&
  (filter.plugin === undefined || source.plugin === filter.plugin)
  && (filter.sessionId === undefined || source.resource?.sessionId === filter.sessionId)
  && (filter.resourceId === undefined || source.resource?.id === filter.resourceId)
  && (filter.resourceKind === undefined || source.resource?.kind === filter.resourceKind);
export function eventSubscriptionFailure(error: unknown): SubscriptionEnd {
  return { reason: error instanceof PluginApiError && error.code === "unavailable" ? "unavailable" : "invalid_contract",
    message: error instanceof Error ? error.message : String(error) };
}

/** Global contract routing: validate, stamp origin, and immediately deliver to matching subscriptions; stores no state and does not roll back with transactions. */
export class EventBus {
  private contracts = new Map<string, EventContract>();
  private listeners = new Map<string, Set<Listener>>();
  private stopped = false;
  declare(owner: string, contract: EventContract): void {
    if (!belongsTo(owner, contract.id)) throw new PluginApiError("foreign_event", "The event contract belongs to another plugin.");
    this.declarePublic(contract);
  }
  /** Public contracts registered by software; each contract's source still constrains publisher identity. */
  declarePublic(contract: EventContract): void {
    if (this.stopped) throw new PluginApiError("unavailable", "The event bus is closed.");
    const previous = this.contracts.get(contract.id);
    if (previous && previous !== contract) throw new PluginApiError("conflict", `Conflicting event declaration: ${contract.id}.`);
    this.contracts.set(contract.id, contract);
  }
  contract(id: string): EventContract {
    const contract = this.contracts.get(id);
    if (!contract || this.stopped) throw new PluginApiError("unavailable", `Event contract ${id} is unavailable.`);
    return contract;
  }
  private validate(contract: EventContract, options: EventSubscribeOptions = {}): void {
    if (this.contract(contract.id) !== contract) throw new PluginApiError("invalid_argument", "Use the declared event contract instance.");
    if (options.delivery === "latest" && contract.semantics.kind !== "snapshot")
      throw new PluginApiError("invalid_argument", "Only snapshot events support latest delivery.");
    if (options.source !== undefined && !eventFilterSchema.safeParse(options.source).success)
      throw new PluginApiError("invalid_argument", "Invalid event source filter.");
  }
  removeOwner(owner: string): void {
    for (const [id] of this.contracts) if (belongsTo(owner, id)) {
      this.contracts.delete(id);
      for (const listener of [...this.listeners.get(id) ?? []]) listener.queue.end({ reason: "unavailable" });
    }
  }
  publish(contract: EventContract, source: Source, input: unknown): void {
    this.validate(contract);
    const kind = source === null ? "host" : source.resource ? "resource" : "plugin";
    if (contract.source === "host" ? kind !== "host" : kind === "host" || (contract.source !== "any" && contract.source !== kind))
      throw new PluginApiError("invalid_argument", "The event source does not match its contract.");
    let raw: Json, data: Json, key: string;
    try {
      raw = deepFreeze(jsonSchema.parse(structuredClone(input)));
      data = deepFreeze(jsonSchema.parse(contract.schema.parse(raw)));
      key = eventKey(contract, source, data);
    } catch (error) { throw new PluginApiError("invalid_argument", `Invalid event payload: ${error instanceof Error ? error.message : String(error)}`); }
    const listeners = this.listeners.get(contract.id);
    if (!listeners?.size) return;
    const common = { contract: { id: contract.id }, emittedAt: new Date().toISOString(), source: deepFreeze(structuredClone(source)) };
    const packet: EventPacket = { event: deepFreeze({ ...common, data }), wire: deepFreeze({ ...common, data: raw }) };
    for (const listener of listeners) if (matches(source, listener.filter)) listener.queue.push(packet, key);
  }
  listen(contract: EventContract, options: EventSubscribeOptions,
    consume: (packet: EventPacket, signal: AbortSignal) => void | Promise<void>): EventQueue<EventPacket> {
    this.validate(contract, options);
    const listeners = this.listeners.get(contract.id) ?? new Set<Listener>(); this.listeners.set(contract.id, listeners);
    const queue = new EventQueue<EventPacket>({ latest: options.delivery === "latest", consume, ended: () => {
      listeners.delete(listener); if (!listeners.size) this.listeners.delete(contract.id);
    } });
    const listener: Listener = { filter: options.source ? { ...options.source } : undefined, queue };
    listeners.add(listener);
    queue.bind(options.signal); queue.markReady();
    return queue;
  }
  close(): void {
    this.stopped = true;
    for (const listeners of [...this.listeners.values()]) for (const listener of [...listeners]) listener.queue.end({ reason: "unavailable" });
    this.contracts.clear();
  }
}
