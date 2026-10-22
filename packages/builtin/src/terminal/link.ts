import { useEffect, useSyncExternalStore } from "react";
import type { ChannelEnd, ResourceRef } from "@atelier/sdk/contracts";
import type { RendererChannel, RendererObjectContext } from "@atelier/sdk/renderer";
import { TerminalChannel, inactiveStatus, type TerminalDown, type TerminalStatus, type TerminalUp } from "./contract.ts";

/** 已渲染字符的确认粒度；须小于后台低水位，确认滞留不阻止恢复。 */
const ACK_CHUNK = 4096;
/** 前端屏幕：按通道顺序消费帧，写入完成后确认字符数。 */
export interface TerminalScreen { receive(frame: Exclude<TerminalDown, { type: "status" }>, done: () => void): void }

/**
 * 同一终端对象在前端只开一条通道；卡片正文与头部状态共享。
 * 无屏幕挂载时帧直接确认，避免后台因无人消费而暂停 PTY。
 */
class TerminalLink {
  status: TerminalStatus = { ...inactiveStatus };
  end: ChannelEnd | null = null;
  private screen: TerminalScreen | null = null;
  private readonly listeners = new Set<() => void>();
  private pendingAck = 0;
  private users = 0;
  private readonly channel: RendererChannel<TerminalUp, TerminalDown>;
  constructor(open: RendererObjectContext["openChannel"], private readonly released: () => void) {
    this.channel = open(TerminalChannel);
    this.channel.onMessage(frame => this.receive(frame));
    // 后台结束的通道不再复用：之后挂载的视图重新打开。
    void this.channel.closed.then(end => { this.released(); if (end.reason !== "closed") { this.end = end; this.notify(); } });
  }
  private receive(frame: TerminalDown) {
    if (frame.type === "status") { this.status = frame.status; this.notify(); return; }
    const chars = frame.type === "output" ? frame.data.length : 0;
    if (!this.screen) { this.ack(chars); return; }
    this.screen.receive(frame, () => this.ack(chars));
  }
  private ack(chars: number) {
    this.pendingAck += chars;
    if (this.pendingAck < ACK_CHUNK) return;
    const value = this.pendingAck;
    this.pendingAck = 0;
    this.send({ type: "ack", chars: value });
  }
  private notify() { for (const listener of this.listeners) listener(); }
  send(message: TerminalUp) {
    try { this.channel.send(message); } catch { /* 通道结束由 end 呈现。 */ }
  }
  /** 屏幕挂载时请求当前快照；同时只有一个屏幕消费输出。 */
  attach(screen: TerminalScreen) {
    this.screen = screen;
    this.send({ type: "refresh" });
    return () => { if (this.screen === screen) this.screen = null; };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  acquire() { this.users++; }
  release() {
    if (--this.users > 0) return;
    // 同步重挂载（开发模式重放 effect）不关闭通道。
    queueMicrotask(() => { if (this.users === 0) { this.channel.close(); this.released(); } });
  }
}

const links = new Map<string, TerminalLink>();
const key = (ref: ResourceRef) => `${ref.sessionId}\n${ref.id}`;
function link(object: RendererObjectContext): TerminalLink {
  const id = key(object.ref);
  let current = links.get(id);
  if (!current) {
    const created: TerminalLink = new TerminalLink(object.openChannel, () => { if (links.get(id) === created) links.delete(id); });
    links.set(id, current = created);
  }
  return current;
}

/** 绑定对象的终端通道；返回实时状态与通道结束原因。 */
export function useTerminalLink(object: RendererObjectContext) {
  const current = link(object);
  useEffect(() => { current.acquire(); return () => current.release(); }, [current]);
  const status = useSyncExternalStore(current.subscribe, () => current.status);
  const end = useSyncExternalStore(current.subscribe, () => current.end);
  return { link: current, status, end };
}
