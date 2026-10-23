export function thinkingDuration(startedAt: number | null, endedAt: number): string | null {
  if (startedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  const seconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
