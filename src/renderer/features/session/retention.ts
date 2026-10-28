import type { RendererRetained } from "@asterism-app/sdk/renderer";

type Entry = { value: unknown; release?: (value: never) => void | Promise<void> };

/**
 * Object retention: user-created frontend state that cannot be reconstructed from projections (drafts, etc.) is registered per object,
 * independently of session view mounting and release; call release when the object leaves the current session projection or is explicitly discarded.
 * Exists only in application memory and is not restored after restart.
 */
export class ObjectRetention {
  private sessions = new Map<string, Map<string, Map<string, Entry>>>();

  /** Bind a retention interface to one object for the SDK object context. */
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

  /** Use the current session projection as the authority: release all objects absent from it. */
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

/** A plugin release failure does not affect other entries, and the error is exposed directly. */
function release(entry: Entry): void {
  try {
    const result = entry.release?.(entry.value as never);
    if (result) result.catch(error => console.error("A retained object state could not be released.", error));
  } catch (error) { console.error("A retained object state could not be released.", error); }
}

/** The application's sole object retention table. */
export const objectRetention = new ObjectRetention();
