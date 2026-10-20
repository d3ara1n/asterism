import type { ProviderPreset, ProviderUsageError, ProviderUsageState, UsageItem, UsageProviderInfo } from "./provider-usage.ts";
import type { UiText } from "./i18n.ts";

/** 只有当前连接选中的查询实现取得该连接凭据；消费者只接收归一化结果。 */
export interface UsageQueryContext {
  readonly connection: { id: string; endpoint: string };
  readonly credential: string | null;
  readonly signal: AbortSignal;
}
export interface UsageProvider {
  readonly id: string;
  readonly label: UiText;
  query(context: UsageQueryContext): Promise<UsageItem[]>;
}
/** 提供方报告可公开的错误类别，原始响应和凭据不跨进程交付。 */
export class UsageQueryError extends Error {
  constructor(readonly code: ProviderUsageError) { super(`Provider usage query failed: ${code}.`); }
}
export interface ProviderServices {
  presets(): readonly ProviderPreset[];
  usageProviders(): readonly UsageProviderInfo[];
  queryUsage(providerId: string, options?: { signal?: AbortSignal; refresh?: boolean }): Promise<ProviderUsageState>;
}
