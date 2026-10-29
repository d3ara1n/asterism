import type { ResourceRef } from "@asterism-app/sdk/contracts";

export interface HeldLink { receiverId: string; resourceId: string; holds: number }
interface Entry { sessionId: string; receiverId: string; resourceId: string; count: number }

/** Request-owned holds retain directed access independently of the current history projection. */
export class ResourceHolds {
  private readonly entries = new Map<string, Entry>();
  private readonly waiters = new Map<string, Set<() => void>>();

  constructor(private readonly changed: (sessionId: string) => void = () => {}) {}

  acquire(receiver: ResourceRef, resources: readonly ResourceRef[]): () => void {
    const resourceIds = [...new Set(resources.map(resource => resource.id))];
    const keys = resourceIds.map(id => `${receiver.id}\0${id}`);
    for (const [index, resourceId] of resourceIds.entries()) {
      const key = keys[index]!;
      const current = this.entries.get(key);
      if (current) current.count++;
      else this.entries.set(key, { sessionId: receiver.sessionId, receiverId: receiver.id, resourceId, count: 1 });
    }
    if (resourceIds.length) this.changed(receiver.sessionId);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      for (const key of keys) {
        const entry = this.entries.get(key)!;
        if (--entry.count === 0) this.entries.delete(key);
      }
      for (const id of [receiver.id, ...resourceIds]) {
        if (this.has(id)) continue;
        const pending = this.waiters.get(id);
        this.waiters.delete(id);
        for (const wake of pending ?? []) wake();
      }
      if (resourceIds.length) this.changed(receiver.sessionId);
    };
  }

  has(resourceId: string): boolean {
    for (const entry of this.entries.values())
      if (entry.receiverId === resourceId || entry.resourceId === resourceId) return true;
    return false;
  }

  links(sessionId: string): HeldLink[] {
    return [...this.entries.values()].filter(entry => entry.sessionId === sessionId)
      .map(entry => ({ receiverId: entry.receiverId, resourceId: entry.resourceId, holds: entry.count }));
  }

  released(resourceId: string): Promise<void> {
    if (!this.has(resourceId)) return Promise.resolve();
    return new Promise(resolve => {
      const pending = this.waiters.get(resourceId) ?? new Set();
      pending.add(resolve);
      this.waiters.set(resourceId, pending);
    });
  }
}
