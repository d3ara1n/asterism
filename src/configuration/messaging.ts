import {
  messagingProviderTypeSchema, messagingEventSchema, conversationQuerySchema, conversationListSchema,
  messageQuerySchema, messageListSchema, sendMessageSchema, messageSchema, messagingFileQuerySchema,
  type MessagingConnection, type MessagingConnectionInfo, type MessagingProviderType, type ConnectionEvent,
} from "@asterism-app/sdk/contracts";
import { MessagingError, type MessagingProviderDefinition, type MessagingInstance, type MessagingServices,
  type MessagingHandle } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../plugins/lifecycle.ts";
import { resolveProviderSettings, ProviderSettingError } from "./provider-settings.ts";

interface Entry { owner: string; definition: MessagingProviderDefinition; info: MessagingProviderType; runs: RunGroup }
/** One configured connection from start until replacement: its creation attempts, instance, and receive loop. */
interface Generation {
  entry: Entry; abort: AbortController;
  /** The latest creation attempt; operations wait for it with their own signals. */
  attempt: Promise<MessagingInstance>;
  /** Settles when this generation will not receive again; the next generation's receiver starts after it. */
  idle: Promise<void>;
  status: "connecting" | "connected" | "reconnecting" | "failed"; identity?: string; error?: string;
}
interface Configuration {
  list(): MessagingConnection[];
  /** Read a saved secret value; null when no value is saved for the key. */
  secret(id: string, key: string): Promise<string | null>;
  /** Connection state changed outside a configuration command. */
  changed(): void;
}

const maxRetryDelayMs = 60_000;
/** Delay before the next attempt, or null when the failure is terminal. */
export function retryDelay(error: unknown, failures: number): number | null {
  if (error instanceof MessagingError) {
    if (error.code !== "request_failed") return null;
    if (error.retryAfterMs !== undefined) return error.retryAfterMs;
  }
  return Math.min(maxRetryDelayMs, 1000 * 2 ** Math.max(0, failures - 1));
}
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
/** A caller can stop waiting without cancelling the shared connection attempt. */
function waitFor<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    pending.then(value => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(signal.reason); else resolve(value);
    }, error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Shared connections have no Agent, resource, unread, or message-storage semantics. */
export class MessagingRegistry implements MessagingServices {
  private readonly entries = new Map<string, Entry>();
  private readonly active = new Map<string, Generation>();
  private readonly listeners = new Set<(event: ConnectionEvent) => void>();
  private readonly changes = new Set<() => void>();
  constructor(private readonly configuration: Configuration, private readonly delay: typeof retryDelay = retryDelay) {}
  types() { return [...this.entries.values()].map(entry => structuredClone(entry.info)); }
  connections(): MessagingConnectionInfo[] {
    return this.configuration.list().map(({ settings: _settings, ...state }) => {
      const active = this.active.get(state.id);
      return { ...state, status: !state.enabled ? "disabled" : active?.status ?? "unavailable",
        ...(active?.identity ? { identity: active.identity } : {}), ...(active?.error ? { error: active.error } : {}) };
    });
  }
  subscribe(listener: (event: ConnectionEvent) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  subscribeConnections(listener: () => void) {
    this.changes.add(listener);
    return () => { this.changes.delete(listener); };
  }
  /** Consumers always hear connection changes; configuration commands publish their own snapshot. */
  private changed(snapshot: boolean) {
    if (snapshot) this.configuration.changed();
    for (const listener of this.changes) {
      try { listener(); } catch (error) { console.error("Messaging connection listener failed.", error); }
    }
  }
  declare(owner: string, definitions: readonly MessagingProviderDefinition[], runs: RunGroup) {
    const ids = new Set(this.entries.keys());
    const entries = definitions.map(definition => {
      if (ids.has(definition.id)) throw new Error(`Duplicate messaging provider: ${definition.id}`);
      ids.add(definition.id);
      const info = messagingProviderTypeSchema.parse({ id: definition.id, owner, label: definition.label, settings: definition.settings });
      return { owner, definition, info, runs };
    });
    for (const entry of entries) this.entries.set(entry.info.id, entry);
    for (const state of this.configuration.list())
      if (state.enabled && entries.some(entry => entry.info.id === state.providerId)) this.start(state.id);
    this.changed(true);
  }
  removeOwners(owners: readonly string[]) {
    for (const [id, entry] of this.entries) if (owners.includes(entry.owner)) this.entries.delete(id);
    for (const [id, generation] of this.active) if (owners.includes(generation.entry.owner)) {
      generation.abort.abort();
      this.active.delete(id);
    }
    this.changed(true);
  }
  /** Replace a connection's generation from its current configuration. */
  restart(id: string) {
    this.start(id);
    this.changed(false);
  }
  /** Stop a removed connection and release provider-owned data once its receiver has ended. */
  remove(id: string, providerId: string) {
    const previous = this.active.get(id);
    this.restart(id);
    const entry = this.entries.get(providerId), forget = entry?.definition.forget;
    if (!entry || !forget || entry.runs.closed) return;
    const idle = previous?.idle ?? Promise.resolve();
    void entry.runs.start(async () => { await idle; await forget(id); }, { affectsHistory: false }).done
      .catch(error => { console.error("Messaging provider data cleanup failed.", error); });
  }
  private start(id: string) {
    const previous = this.active.get(id);
    previous?.abort.abort();
    this.active.delete(id);
    const state = this.configuration.list().find(item => item.id === id);
    const entry = state && this.entries.get(state.providerId);
    if (!state?.enabled || !entry || entry.runs.closed) return;
    this.launch(id, entry, previous?.idle ?? Promise.resolve());
  }
  private launch(id: string, entry: Entry, before: Promise<void>) {
    const abort = new AbortController();
    let settle!: () => void;
    const generation: Generation = { entry, abort, attempt: new Promise(() => {}), idle: new Promise(resolve => { settle = resolve; }), status: "connecting" };
    this.active.set(id, generation);
    const current = () => this.active.get(id) === generation;
    const update = (change: Pick<Generation, "status" | "error">) => {
      if (!current()) return;
      generation.status = change.status; generation.error = change.error;
      this.changed(true);
    };
    const settings = () => {
      const state = this.configuration.list().find(item => item.id === id);
      if (!state) throw new MessagingError("unavailable", `Messaging connection '${id}' no longer exists.`);
      return resolveProviderSettings(entry.info.settings, state.settings, key => this.configuration.secret(id, key)).catch(error => {
        throw error instanceof ProviderSettingError ? new MessagingError("unavailable", error.message) : error;
      });
    };
    // Creation runs in the provider lifecycle rather than this generation, so captured operations can finish a pending attempt after replacement.
    const connect = () => {
      const attempt = entry.runs.start(async signal => {
        const values = await settings();
        signal.throwIfAborted();
        return entry.definition.create({ connectionId: id, settings: values, signal, publish: raw => this.publish(id, generation, raw) });
      }, { affectsHistory: false }).done;
      attempt.catch(() => {});
      generation.attempt = attempt;
      return attempt;
    };
    const backoff = async (error: unknown, failures: number) => {
      const wait = this.delay(error, failures);
      if (wait === null) { update({ status: "failed", error: message(error) }); return false; }
      update({ status: generation.identity ? "reconnecting" : "connecting", error: message(error) });
      await sleep(wait, abort.signal);
      return true;
    };
    let receiving = false;
    void (async () => {
      let failures = 0, instance: MessagingInstance | undefined;
      while (!instance) {
        try { instance = await connect(); }
        catch (error) {
          if (abort.signal.aborted || entry.runs.closed || !await backoff(error, ++failures)) return;
        }
      }
      if (abort.signal.aborted) return;
      generation.identity = instance.identity;
      failures = 0;
      this.changed(true);
      // Only one receiver per connection is active; a replaced generation finishes before the next one receives.
      await before;
      if (abort.signal.aborted) return;
      receiving = true;
      for (;;) {
        const ready = () => {
          failures = 0;
          if (generation.status !== "connected") update({ status: "connected", error: undefined });
        };
        const reconnecting = (error: unknown) => update({ status: "reconnecting", error: message(error) });
        try {
          const receiver = instance;
          await entry.runs.start(signal => receiver.receive({ signal, ready, reconnecting }), { signal: abort.signal, affectsHistory: false }).done;
          return;
        } catch (error) {
          if (abort.signal.aborted || entry.runs.closed || !await backoff(error, ++failures)) return;
        }
      }
    })().catch(error => {
      if (!abort.signal.aborted && !entry.runs.closed) update({ status: "failed", error: message(error) });
    }).finally(() => { if (receiving) settle(); else void before.then(settle); });
  }
  private publish(id: string, generation: Generation, raw: unknown) {
    // Retired receivers stop publishing; operations captured before retirement can still complete.
    if (generation.abort.signal.aborted || generation.entry.runs.closed) return;
    const event = messagingEventSchema.parse(raw);
    for (const listener of this.listeners) {
      try { listener({ connectionId: id, event: structuredClone(event) }); }
      catch (error) { console.error("Messaging event listener failed.", error); }
    }
  }
  async resolve(id: string, options: { signal: AbortSignal }): Promise<MessagingHandle> {
    options.signal.throwIfAborted();
    const generation = this.active.get(id);
    if (!generation) throw new MessagingError("unavailable", `Messaging connection '${id}' is unavailable.`);
    const run = <T>(signal: AbortSignal, work: (instance: MessagingInstance, signal: AbortSignal) => Promise<T>) =>
      generation.entry.runs.start(async scope => work(await waitFor(generation.attempt, scope), scope), { signal, affectsHistory: false }).done;
    return {
      listConversations: (query, { signal }) => run(signal, async (instance, scope) =>
        conversationListSchema.parse(await instance.listConversations(conversationQuerySchema.parse(query), { signal: scope }))),
      readMessages: (query, { signal }) => run(signal, async (instance, scope) =>
        messageListSchema.parse(await instance.readMessages(messageQuerySchema.parse(query), { signal: scope }))),
      sendMessage: (input, { signal }) => run(signal, async (instance, scope) =>
        messageSchema.parse(await instance.sendMessage(sendMessageSchema.parse(input), { signal: scope }))),
      openFile: (query, { signal }) => generation.entry.runs.iterate(async function* (scope) {
        const instance = await waitFor(generation.attempt, scope);
        if (!instance.openFile) throw new MessagingError("unsupported", "This messaging provider does not expose attachments.");
        yield* instance.openFile(messagingFileQuerySchema.parse(query), { signal: scope });
      }, signal, { rejectOnAbort: true }),
    };
  }
  close() {
    for (const generation of this.active.values()) generation.abort.abort();
    this.active.clear();
    this.listeners.clear();
    this.changes.clear();
  }
}
