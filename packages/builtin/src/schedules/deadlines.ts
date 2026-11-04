/** Node converts larger timeout delays to 1 ms; long waits must be split at its supported limit. */
const maxTimeoutMs = 2_147_483_647;

export function planWakeup<T extends { nextAt: number | null }>(entries: Iterable<T>, now: number): {
  due: T[]; nextAt: number | null; delayMs: number | null;
} {
  const due: T[] = [];
  let nextAt: number | null = null;
  for (const entry of entries) {
    if (entry.nextAt === null) continue;
    if (entry.nextAt <= now) due.push(entry);
    if (nextAt === null || entry.nextAt < nextAt) nextAt = entry.nextAt;
  }
  return { due, nextAt, delayMs: nextAt === null ? null : Math.max(1, Math.min(maxTimeoutMs, nextAt - now)) };
}
