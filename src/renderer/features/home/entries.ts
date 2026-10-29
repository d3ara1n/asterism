export interface SessionEntryIdentity { pluginId: string; id: string }
export interface SessionEntrySelection { pluginId: string; entryId: string }
/** An explicit unavailable selection stays unresolved, even when another sole entry remains. */
export function resolveSessionEntry<T extends SessionEntryIdentity>(entries: readonly T[], selection: SessionEntrySelection | null): T | null {
  if (selection) return entries.find(entry => entry.pluginId === selection.pluginId && entry.id === selection.entryId) ?? null;
  return entries.length === 1 ? entries[0]! : null;
}
export const sessionEntryKey = (entry: SessionEntryIdentity) => JSON.stringify([entry.pluginId, entry.id]);
