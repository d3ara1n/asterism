import { belongsTo, type ChannelEnd, type ChannelValue, type ResourceRef } from "@atelier/sdk/contracts";
import { PluginApiError, type ChannelContribution, type ObjectChannel } from "@atelier/sdk/runtime";
import type { SdkContext } from "./sdk-context.ts";
import type { PluginHostServices } from "./loader.ts";

/** 通道另一端（renderer 连接）：接收后台消息与结束通知。 */
export interface ChannelPeer {
  deliver(data: ChannelValue): void;
  ended(end: ChannelEnd): void;
}
export interface OpenedChannel {
  /** 前端消息；按到达顺序交付给后台监听。 */
  receive(data: ChannelValue): void;
  /** 前端或连接关闭；不再通知 peer。 */
  close(end: ChannelEnd): void;
}

class HostChannel implements ObjectChannel {
  private readonly controller = new AbortController();
  private readonly listeners = new Set<(data: ChannelValue) => void>();
  private buffered: ChannelValue[] | null = [];
  constructor(readonly object: ObjectChannel["object"], readonly ref: ResourceRef, private readonly owner: string,
    private readonly peer: ChannelPeer, private readonly released: (channel: HostChannel) => void) {}
  get signal() { return this.controller.signal; }
  get ownerId() { return this.owner; }
  send(data: ChannelValue) {
    if (this.signal.aborted) throw new PluginApiError("unavailable", "The channel is closed.");
    this.peer.deliver(data);
  }
  onMessage(listener: (data: ChannelValue) => void) {
    this.listeners.add(listener);
    const pending = this.buffered;
    this.buffered = null;
    for (const data of pending ?? []) listener(data);
    return () => { this.listeners.delete(listener); };
  }
  receive(data: ChannelValue) {
    if (this.signal.aborted) return;
    if (this.buffered) { this.buffered.push(data); return; }
    for (const listener of this.listeners) {
      try { listener(data); } catch (error) { console.error("Channel listener failed.", error); }
    }
  }
  close(end: ChannelEnd = { reason: "closed" }, notify = true) {
    if (this.signal.aborted) return;
    this.buffered = null; this.listeners.clear();
    this.controller.abort(end);
    this.released(this);
    if (notify) this.peer.ended(end);
  }
}

/** 通道按契约路由到对象所属插件；打开时校验对象位于当前路径，对象离开当前集合时由宿主结束。 */
export class ChannelRegistry {
  private readonly entries = new Map<string, { owner: string; contribution: ChannelContribution; sdk: SdkContext }>();
  private readonly open = new Set<HostChannel>();
  constructor(private readonly host: Pick<PluginHostServices, "refOf" | "sessions">) {}
  declare(owner: string, contribution: ChannelContribution, sdk: SdkContext) {
    if (!belongsTo(owner, contribution.contract.id)) throw new PluginApiError("foreign_resource", "The channel belongs to another plugin.");
    if (this.entries.has(contribution.contract.id)) throw new PluginApiError("conflict", `Duplicate channel: ${contribution.contract.id}`);
    this.entries.set(contribution.contract.id, { owner, contribution, sdk });
  }
  removeOwner(owner: string) {
    for (const [id, entry] of this.entries) if (entry.owner === owner) this.entries.delete(id);
    for (const channel of [...this.open]) if (channel.ownerId === owner) channel.close({ reason: "unavailable", message: "The plugin is closing." });
  }
  connect(contractId: string, object: ResourceRef, peer: ChannelPeer): OpenedChannel {
    const entry = this.entries.get(contractId);
    if (!entry) throw new PluginApiError("unavailable", "The channel is unavailable.");
    const ref = Object.freeze({ ...object });
    const actual = this.host.refOf(ref.id);
    if (!actual || actual.kind !== ref.kind || actual.sessionId !== ref.sessionId || !belongsTo(entry.owner, ref.kind) ||
      !this.host.sessions.workbench(ref.sessionId).objects.some(item => item.id === ref.id))
      throw new PluginApiError("unavailable", "The associated object is not on the current session path.");
    // 读取门面在通道打开期间有效，结束后失效。
    const scope = { active: true };
    const channel = new HostChannel(entry.sdk.reader(ref, scope), ref, entry.owner, peer, closed => {
      scope.active = false; this.open.delete(closed);
    });
    this.open.add(channel);
    void Promise.resolve().then(() => entry.contribution.open(channel)).catch(error => {
      if (!(error instanceof PluginApiError)) console.error("Channel open failed.", error);
      channel.close({ reason: "unavailable", message: error instanceof PluginApiError ? error.message : "The channel could not be opened." });
    });
    return { receive: data => channel.receive(data), close: end => channel.close(end, false) };
  }
  /** 资源离开当前集合（移除、回溯）时结束其通道。 */
  release(sessionId: string, objectIds: readonly string[]) {
    const ids = new Set(objectIds);
    for (const channel of [...this.open]) if (channel.ref.sessionId === sessionId && ids.has(channel.ref.id)) channel.close({ reason: "removed" });
  }
  close() {
    for (const channel of [...this.open]) channel.close({ reason: "unavailable", message: "The runtime is closing." });
    this.entries.clear();
  }
}
