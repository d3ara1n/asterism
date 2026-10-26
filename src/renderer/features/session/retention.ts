import type { RendererRetained } from "@asterism/sdk/renderer";

type Entry = { value: unknown; release?: (value: never) => void | Promise<void> };

/**
 * 对象保留：用户产生、无法从投影重建的前端状态（草稿、聚焦身份等）按对象登记，
 * 独立于会话视图的挂载与释放；对象离开当前会话投影或被显式丢弃时调用 release。
 * 只存在于应用内存中，重启后不恢复。
 */
export class ObjectRetention {
  private sessions = new Map<string, Map<string, Map<string, Entry>>>();

  /** 绑定一个对象的保留接口，供 SDK 对象上下文使用。 */
  object(sessionId: string, objectId: string): RendererRetained {
    return {
      get: (key, create, release) => this.get(sessionId, objectId, key, create, release),
      discard: key => this.discard(sessionId, objectId, key),
    };
  }

  get<T>(sessionId: string, objectId: string, key: string, create: () => T, release?: (value: T) => void | Promise<void>): T {
    let objects = this.sessions.get(sessionId);
    if (!objects) this.sessions.set(sessionId, objects = new Map());
    let entries = objects.get(objectId);
    if (!entries) objects.set(objectId, entries = new Map());
    const existing = entries.get(key);
    if (existing) return existing.value as T;
    const value = create();
    entries.set(key, { value, release: release as Entry["release"] });
    return value;
  }

  discard(sessionId: string, objectId: string, key: string): void {
    const objects = this.sessions.get(sessionId);
    const entries = objects?.get(objectId);
    const entry = entries?.get(key);
    if (!entry) return;
    entries!.delete(key);
    if (!entries!.size) objects!.delete(objectId);
    if (!objects!.size) this.sessions.delete(sessionId);
    release(entry);
  }

  /** 以会话当前投影为准：不在其中的对象全部释放。 */
  retainOnly(sessionId: string, objectIds: ReadonlySet<string>): void {
    const objects = this.sessions.get(sessionId);
    if (!objects) return;
    for (const [objectId, entries] of objects) {
      if (objectIds.has(objectId)) continue;
      objects.delete(objectId);
      for (const entry of entries.values()) release(entry);
    }
    if (!objects.size) this.sessions.delete(sessionId);
  }
}

/** 插件释放失败不影响其他条目，错误直接可见。 */
function release(entry: Entry): void {
  try {
    const result = entry.release?.(entry.value as never);
    if (result) result.catch(error => console.error("A retained object state could not be released.", error));
  } catch (error) { console.error("A retained object state could not be released.", error); }
}

/** 应用内唯一的对象保留表。 */
export const objectRetention = new ObjectRetention();
