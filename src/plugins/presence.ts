import type { ResourceSnapshot } from "@asterism/sdk/contracts";

/** 资源存在性独立于事件动作；回溯与普通提交比较同一份当前集合。 */
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
  /** 会话离开在场集合（归档）：返回此前的全部资源并清除登记。 */
  forget(sessionId: string): ResourceSnapshot[] {
    const previous = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    return [...previous?.values() ?? []];
  }
}
