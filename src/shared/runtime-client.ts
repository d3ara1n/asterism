import type { CallFrame } from "./plugin-calls.ts";
import type { EventFrame } from "./plugin-events.ts";
import type {
  ChannelFrame, ConnectionPort, ConnectionService, ConnectionServices, RendererFrame, RuntimeBridge, RuntimeFrame,
} from "./connection.ts";
import type { SessionChanged } from "./session.ts";

type Result = ConnectionServices[ConnectionService]["result"];

/**
 * Renderer direct client: queue in order before port arrival; after failure settle all in-flight and subsequent requests as unavailable.
 * No deadlines for in-process business waits; port close or runtime status notifications end waits when the task process is lost.
 */
export class RuntimeClient implements RuntimeBridge {
  private port: ConnectionPort<RuntimeFrame, RendererFrame> | null = null;
  private queued: RendererFrame[] = [];
  private failure: string | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, (result: Result) => void>();
  private readonly sessionListeners = new Set<(event: SessionChanged) => void>();
  private readonly configurationListeners = new Set<() => void>();
  private readonly pluginConfigurationListeners = new Set<(id: string) => void>();
  private readonly eventListeners = new Set<(frame: EventFrame) => void>();
  private readonly callListeners = new Set<(frame: CallFrame) => void>();
  private readonly channelListeners = new Set<(frame: ChannelFrame) => void>();

  attach(port: ConnectionPort<RuntimeFrame, RendererFrame>): void {
    if (this.port || this.failure) { port.close(); return; }
    this.port = port;
    port.onMessage(frame => this.receive(frame));
    const queued = this.queued;
    this.queued = [];
    for (const frame of queued) this.post(frame);
  }
  /** Port unavailable: settle in-flight requests and fail subsequent sends immediately. */
  fail(message: string): void {
    if (this.failure) return;
    this.failure = message;
    this.queued = [];
    const port = this.port;
    this.port = null;
    try { port?.close(); } catch { /* The port is closed. */ }
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const resolve of pending) resolve({ ok: false, error: { code: "unavailable", message } });
  }
  get failed(): boolean { return this.failure !== null; }

  private post(frame: RendererFrame): void {
    if (this.failure) throw new Error(this.failure);
    if (!this.port) { this.queued.push(frame); return; }
    try { this.port.post(frame); }
    catch { this.fail("The runtime connection was lost."); throw new Error("The runtime connection was lost."); }
  }
  private request<S extends ConnectionService>(service: S, command: ConnectionServices[S]["command"]): Promise<ConnectionServices[S]["result"]> {
    if (this.failure) return Promise.resolve({ ok: false, error: { code: "unavailable", message: this.failure } } as ConnectionServices[S]["result"]);
    const id = this.nextId++;
    return new Promise(resolve => {
      this.pending.set(id, resolve as (result: Result) => void);
      try { this.post({ kind: "request", id, service, command }); }
      catch (error) {
        this.pending.delete(id);
        resolve({ ok: false, error: { code: "unavailable", message: error instanceof Error ? error.message : String(error) } } as ConnectionServices[S]["result"]);
      }
    });
  }
  private receive(frame: RuntimeFrame): void {
    switch (frame.kind) {
      case "response": {
        const resolve = this.pending.get(frame.id);
        this.pending.delete(frame.id);
        resolve?.(frame.result);
        return;
      }
      case "session": for (const listener of this.sessionListeners) listener(frame.event); return;
      case "configuration.changed": for (const listener of this.configurationListeners) listener(); return;
      case "plugin-configuration.changed": for (const listener of this.pluginConfigurationListeners) listener(frame.id); return;
      case "events": for (const listener of this.eventListeners) listener(frame.frame); return;
      case "calls": for (const listener of this.callListeners) listener(frame.frame); return;
      case "channels": for (const listener of this.channelListeners) listener(frame.frame); return;
    }
  }
  private static listen<T>(set: Set<T>, listener: T): () => void {
    set.add(listener);
    return () => { set.delete(listener); };
  }

  execute = (command: ConnectionServices["workspace"]["command"]) => this.request("workspace", command);
  readonly session: RuntimeBridge["session"] = {
    execute: command => this.request("session", command),
    onChanged: listener => RuntimeClient.listen(this.sessionListeners, listener),
  };
  readonly configuration: RuntimeBridge["configuration"] = {
    execute: command => this.request("configuration", command),
    onChanged: listener => RuntimeClient.listen(this.configurationListeners, listener),
  };
  readonly pluginConfiguration: RuntimeBridge["pluginConfiguration"] = {
    execute: command => this.request("plugin-configuration", command),
    onChanged: listener => RuntimeClient.listen(this.pluginConfigurationListeners, listener),
  };
  readonly content: RuntimeBridge["content"] = { execute: command => this.request("content", command) };
  readonly events: RuntimeBridge["events"] = {
    send: control => this.post({ kind: "events", control }),
    onFrame: listener => RuntimeClient.listen(this.eventListeners, listener),
  };
  readonly calls: RuntimeBridge["calls"] = {
    send: control => this.post({ kind: "calls", control }),
    onFrame: listener => RuntimeClient.listen(this.callListeners, listener),
  };
  readonly channels: RuntimeBridge["channels"] = {
    send: control => this.post({ kind: "channels", control }),
    onFrame: listener => RuntimeClient.listen(this.channelListeners, listener),
  };
}
