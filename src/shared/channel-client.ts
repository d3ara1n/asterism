import type { ChannelContract, ChannelEnd, ChannelValue, ResourceRef } from "@asterism/sdk/contracts";
import type { RendererChannel } from "@asterism/sdk/renderer";
import type { ChannelBridge, ChannelFrame } from "./connection.ts";

class ClientChannel implements RendererChannel {
  private readonly listeners = new Set<(data: ChannelValue) => void>();
  private buffered: ChannelValue[] | null = [];
  private ended: ChannelEnd | null = null;
  private resolveClosed!: (end: ChannelEnd) => void;
  readonly closed = new Promise<ChannelEnd>(resolve => { this.resolveClosed = resolve; });
  constructor(private readonly post: (data: ChannelValue) => void, private readonly release: () => void) {}
  send(data: ChannelValue) {
    if (this.ended) throw new Error("The channel is closed.");
    this.post(data);
  }
  onMessage(listener: (data: ChannelValue) => void) {
    this.listeners.add(listener);
    const pending = this.buffered;
    this.buffered = null;
    for (const data of pending ?? []) listener(data);
    return () => { this.listeners.delete(listener); };
  }
  receive(data: ChannelValue) {
    if (this.ended) return;
    if (this.buffered) { this.buffered.push(data); return; }
    for (const listener of this.listeners) {
      try { listener(data); } catch (error) { console.error("Channel listener failed.", error); }
    }
  }
  end(end: ChannelEnd) {
    if (this.ended) return;
    this.ended = end; this.buffered = null; this.listeners.clear();
    this.resolveClosed(end);
  }
  close() {
    if (this.ended) return;
    this.end({ reason: "closed" });
    this.release();
  }
}

/** Renderer channel table: numbers are assigned within this connection; disconnection ends all channels as disconnected. */
export class ChannelClient {
  private nextId = 1;
  private readonly channels = new Map<number, ClientChannel>();
  constructor(private readonly bridge: ChannelBridge) {
    bridge.onFrame((frame: ChannelFrame) => {
      const channel = this.channels.get(frame.id);
      if (!channel) return;
      if (frame.type === "message") channel.receive(frame.data);
      else { this.channels.delete(frame.id); channel.end(frame.end); }
    });
  }
  open<Up extends ChannelValue, Down extends ChannelValue>(contract: ChannelContract<Up, Down>, object: ResourceRef): RendererChannel<Up, Down> {
    const id = this.nextId++;
    const channel = new ClientChannel(
      data => this.bridge.send({ type: "message", id, data }),
      () => {
        this.channels.delete(id);
        try { this.bridge.send({ type: "close", id }); } catch { /* The connection is disconnected. */ }
      });
    this.channels.set(id, channel);
    try { this.bridge.send({ type: "open", id, contract: contract.id, object: { sessionId: object.sessionId, id: object.id, kind: object.kind } }); }
    catch { this.channels.delete(id); channel.end({ reason: "disconnected" }); }
    return channel as unknown as RendererChannel<Up, Down>;
  }
  disconnect() {
    const channels = [...this.channels.values()];
    this.channels.clear();
    for (const channel of channels) channel.end({ reason: "disconnected" });
  }
}
