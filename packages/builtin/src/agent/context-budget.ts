/** Context budget policy shared by compression and its diagnostic displays. */
export const COMPRESSION_KEEP_RECENT = 20_000;

/** Unknown windows have only the minimum reserve; automatic triggering still requires a known window. */
export function compressionReserve(window: number | null | undefined): number {
  return Math.max(16_384, Math.ceil((window ?? 0) * 0.1));
}
