import { PluginApiError } from "@asterism/sdk/runtime";
import type { ChannelValue } from "@asterism/sdk/contracts";
import { connectionServices, type ChannelControl, type ConnectionPort, type RendererFrame, type RuntimeFrame } from "../shared/connection.ts";
import { eventControlSchema } from "../shared/plugin-events.ts";
import { callControlSchema } from "../shared/plugin-calls.ts";
import type { SessionChanged } from "../shared/session.ts";
import type { ChannelRegistry, OpenedChannel } from "../plugins/channels.ts";
import { EventPeer } from "./event-peer.ts";
import { CallPeer } from "./call-peer.ts";
import { serve } from "./dispatch.ts";
import type { ApplicationService } from "./service.ts";

/** 一条 renderer 直连上的通道表；编号由 renderer 分配，只在本连接内有效。 */
class ChannelPeer {
  private readonly open = new Map<number, OpenedChannel>();
  constructor(private readonly registry: ChannelRegistry, private readonly send: (frame: RuntimeFrame) => void) {}
  receive(control: ChannelControl) {
    if (control.type === "message") { this.open.get(control.id)?.receive(control.data); return; }
    if (control.type === "close") {
      const channel = this.open.get(control.id);
      this.open.delete(control.id);
      channel?.close({ reason: "closed" });
      return;
    }
    if (this.open.has(control.id)) return;
    const id = control.id;
    try {
      this.open.set(id, this.registry.connect(control.contract, control.object, {
        deliver: data => this.send({ kind: "channels", frame: { type: "message", id, data } }),
        ended: end => { if (this.open.delete(id)) this.send({ kind: "channels", frame: { type: "closed", id, end } }); },
      }));
    } catch (error) {
      this.send({ kind: "channels", frame: { type: "closed", id, end: { reason: "unavailable",
        message: error instanceof PluginApiError ? error.message : "The channel could not be opened." } } });
    }
  }
  close() {
    const channels = [...this.open.values()];
    this.open.clear();
    for (const channel of channels) channel.close({ reason: "disconnected" });
  }
}

function channelControl(raw: unknown): ChannelControl | null {
  if (typeof raw !== "object" || raw === null) return null;
  const control = raw as Record<string, unknown>;
  if (typeof control.id !== "number" || !Number.isSafeInteger(control.id)) return null;
  if (control.type === "message") return "data" in control ? { type: "message", id: control.id, data: control.data as ChannelValue } : null;
  if (control.type === "close") return { type: "close", id: control.id };
  if (control.type !== "open" || typeof control.contract !== "string") return null;
  const object = control.object as Record<string, unknown> | null | undefined;
  if (!object || typeof object.sessionId !== "string" || typeof object.id !== "string" || typeof object.kind !== "string") return null;
  return { type: "open", id: control.id, contract: control.contract, object: { sessionId: object.sessionId, id: object.id, kind: object.kind } };
}

/** renderer 直连：入口按领域结构校验一次；推送帧由受信的任务进程构造，不再逐帧校验。 */
export class RendererConnection {
  private readonly events: EventPeer;
  private readonly calls: CallPeer;
  private readonly channels: ChannelPeer;
  private closed = false;
  constructor(private readonly service: ApplicationService, private readonly port: ConnectionPort<RendererFrame, RuntimeFrame>,
    private readonly onClosed: () => void = () => {}) {
    this.events = new EventPeer(service.sessions.events, frame => this.send({ kind: "events", frame }));
    this.calls = new CallPeer(service.sessions.calls, frame => this.send({ kind: "calls", frame }));
    this.channels = new ChannelPeer(service.sessions.channels, frame => this.send(frame));
    port.onMessage(frame => this.receive(frame));
  }
  send(frame: RuntimeFrame) {
    if (this.closed) return;
    try { this.port.post(frame); } catch { this.close(); }
  }
  session(event: SessionChanged) { this.send({ kind: "session", event }); }
  private receive(raw: unknown) {
    if (this.closed || typeof raw !== "object" || raw === null) return;
    const frame = raw as Record<string, unknown>;
    if (frame.kind === "channels") { const control = channelControl(frame.control); if (control) this.channels.receive(control); return; }
    if (frame.kind === "request") {
      const { id, service } = frame;
      if (typeof id !== "number" || !connectionServices.includes(service as never)) return;
      void serve(this.service, service as never, frame.command).then(result => this.send({ kind: "response", id, result }));
      return;
    }
    if (frame.kind === "events") { const parsed = eventControlSchema.safeParse(frame.control); if (parsed.success) this.events.receive(parsed.data); return; }
    if (frame.kind === "calls") { const parsed = callControlSchema.safeParse(frame.control); if (parsed.success) this.calls.receive(parsed.data); }
  }
  /** 端口关闭或 renderer 重载：结束本连接的订阅、调用与通道，释放内容传输状态。 */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.events.close(); this.calls.close(); this.channels.close();
    void this.service.content.execute({ type: "reset" }).catch(() => {});
    try { this.port.close(); } catch { /* 端口已关闭。 */ }
    this.onClosed();
  }
}
