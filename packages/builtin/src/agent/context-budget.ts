/** 上下文预算常量：后台压缩与前端上下文面板共用，取值见 docs/context-compression.md#预算与保留边界。 */
export const COMPRESSION_RESERVE = 16_384;
export const COMPRESSION_KEEP_RECENT = 20_000;
export const COMPRESSION_MAX_OUTPUT = Math.floor(COMPRESSION_RESERVE * 0.8);
