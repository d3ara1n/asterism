/** Context budget constants shared by background compression and the frontend context panel. */
export const COMPRESSION_RESERVE = 16_384;
export const COMPRESSION_KEEP_RECENT = 20_000;
export const COMPRESSION_MAX_OUTPUT = Math.floor(COMPRESSION_RESERVE * 0.8);
