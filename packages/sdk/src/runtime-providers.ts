import type { ProviderConnection, ProviderPreset, ProviderUsageError, UsageItem, UsageProviderInfo } from "./provider-usage.ts";
import type { UiText } from "./i18n.ts";

/** 消费者显式提供查询所需的连接与凭据。 */
export interface UsageQueryContext {
  readonly connection: { id: string; endpoint: string };
  readonly credential: string | null;
  readonly signal: AbortSignal;
}
interface UsageProviderIdentity {
  readonly id: string;
  readonly label: UiText;
}
export interface QueryUsageProvider extends UsageProviderIdentity {
  readonly source?: "query";
  query(context: UsageQueryContext): Promise<UsageItem[]>;
}
export interface UsageHeadersContext {
  readonly connection: { id: string; endpoint: string };
  readonly model: string;
  readonly status: number;
  readonly receivedAt: number;
  readonly headers: Readonly<Record<string, string>>;
}
/** 消费者交付自己取得的响应元信息；解析器不发起网络请求。 */
export interface HeadersUsageProvider extends UsageProviderIdentity {
  readonly source: "headers";
  /** null 表示本次没有可用数据；空列表明确报告没有额度项。 */
  parseHeaders(context: UsageHeadersContext): UsageItem[] | null;
}
export type UsageProvider = QueryUsageProvider | HeadersUsageProvider;
/** 提供方报告可公开的错误类别，原始响应和凭据不跨进程交付。 */
export class UsageQueryError extends Error {
  constructor(readonly code: ProviderUsageError) { super(`Provider usage query failed: ${code}.`); }
}
export interface ProviderServices {
  presets(): readonly ProviderPreset[];
  list(): readonly ProviderInfo[];
  get(id: string): ProviderInfo | null;
  /** 仅后台可用；读取该连接的当前凭据，无鉴权连接返回 null。 */
  credential(id: string, options?: { signal?: AbortSignal }): Promise<string | null>;
  /** 连接或预设目录变化；返回取消订阅函数，插件关闭时自动取消。 */
  subscribe(listener: () => void): () => void;
}
export interface ProviderInfo extends ProviderConnection {
  id: string;
  name: string;
  enabled: boolean;
}
export interface UsageServices {
  list(): readonly UsageProviderInfo[];
  /** 取得绑定提供方生命周期的实现；不选择连接、读取凭据或保存结果。 */
  get(id: string): UsageProvider | null;
  subscribe(listener: () => void): () => void;
}
