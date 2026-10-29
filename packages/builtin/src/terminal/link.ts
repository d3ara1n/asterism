import { useEffect, useSyncExternalStore } from "react";
import type { ChannelEnd, ResourceRef } from "@asterism-app/sdk/contracts";
import type { RendererChannel, RendererObjectContext } from "@asterism-app/sdk/renderer";
import { TerminalChannel } from "./contract.ts";
import { inactiveStatus, type TerminalDown, type TerminalStatus, type TerminalUp } from "@asterism-app/sdk/contracts";

/** Acknowledgment granularity for rendered characters; must stay below the backend low-water mark so delayed acknowledgments do not prevent resumption. */
const ACK_CHUNK = 4096;
/** Frontend screen: consumes frames in channel order and acknowledges character counts after writes complete. */
export interface TerminalScreen { receive(frame: Exclude<TerminalDown, { type: "status" }>, done: () => void): void }

/**
 * The frontend opens only one channel per terminal object, shared by the card body and header status.
 * Frames are acknowledged directly when no screen is mounted, preventing the backend from pausing the PTY because no consumer is present.
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
    // Channels ended by the backend are not reused; views mounted later open a new one.
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
    try { this.channel.send(message); } catch { /* end represents channel termination. */ }
  }
  /** Requests a current snapshot when the screen mounts; only one screen consumes output at a time. */
  attach(screen: TerminalScreen) {
    this.screen = screen;
    this.send({ type: "refresh" });
    return () => { if (this.screen === screen) this.screen = null; };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  acquire() { this.users++; }
  release() {
    if (--this.users > 0) return;
    // Synchronous remounts (development-mode effect replay) do not close the channel.
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

/** Terminal channel bound to an object; returns live status and the channel termination reason. */
export function useTerminalLink(object: RendererObjectContext) {
  const current = link(object);
  useEffect(() => { current.acquire(); return () => current.release(); }, [current]);
  const status = useSyncExternalStore(current.subscribe, () => current.status);
  const end = useSyncExternalStore(current.subscribe, () => current.end);
  return { link: current, status, end };
}
