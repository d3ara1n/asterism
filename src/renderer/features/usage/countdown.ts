/** Time until a window resets in its two largest units: 45m, 2h 14m, 3d 6h. Past or imminent resets read as one minute. */
export function resetCountdown(now: number, resetAt: number): string {
  const minutes = Math.max(1, Math.ceil((resetAt - now) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
