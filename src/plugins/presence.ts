import type { ResourceSnapshot } from "@asterism/sdk/contracts";

/** Resource presence is independent of event actions; backtracking and ordinary commits compare the same current set. */
export class ResourcePresence {
  private readonly sessions = new Map<string, Map<string, ResourceSnapshot>>();

  update(sessionId: string, resources: readonly ResourceSnapshot[]) {
    const previous = this.sessions.get(sessionId) ?? new Map<string, ResourceSnapshot>();
    const current = new Map(resources.map(resource => [resource.ref.id, resource]));
    this.sessions.set(sessionId, current);
    return {
      appeared: resources.filter(resource => !previous.has(resource.ref.id)),
      disappeared: [...previous.values()].filter(resource => !current.has(resource.ref.id)),
    };
  }
  /** When a session leaves the present set (archival), return all previous resources and clear registration. */
  forget(sessionId: string): ResourceSnapshot[] {
    const previous = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    return [...previous?.values() ?? []];
  }
}
