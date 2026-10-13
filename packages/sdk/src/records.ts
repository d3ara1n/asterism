import type { z } from "zod";
import type { Json } from "./json.ts";

/** 会话记录的公开信封：宿主把存储格式映射为它，插件按契约解码，不依赖内部节点结构。 */
export interface RecordRef { readonly id: string }
/**
 * 记录来源：plugin 由宿主按写入通道的插件身份打戳，插件不能填写，仅供诊断；
 * resource 是经具名资源契约引用并由宿主校验的发出资源，null 表示会话级记录。
 * 被链接的代理等关联对象属于各契约载荷，不借用来源。
 */
export interface RecordSource {
  readonly plugin: string;
  readonly resource: { readonly id: string; readonly kind: string } | null;
}
export interface SessionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly parentId: string | null;
  /** 会话内追加顺序，从 1 开始。 */
  readonly sequence: number;
  readonly createdAt: string;
  readonly contract: RecordRef;
  /** 写入者；宿主按写入通道打戳，关联对象属于 data。 */
  readonly source: RecordSource;
  readonly data: Json;
}
export type Decoded<D> =
  | { readonly status: "known"; readonly record: SessionRecord; readonly data: D }
  | { readonly status: "unknown"; readonly record: SessionRecord; readonly reason: "invalid_data" };
export interface RecordContract<D extends Json = Json> extends RecordRef {
  readonly schema: z.ZodType<D>;
  /** 不属于该契约返回 null；兼容与转换由 schema 决定，失败保留原始记录。 */
  decode(record: SessionRecord): Decoded<D> | null;
}
export function defineRecord<D extends Json>(id: string, definition: {
  schema: z.ZodType<D>;
}): RecordContract<D> {
  const { schema } = definition;
  return {
    id, schema,
    decode(record) {
      if (record.contract.id !== id) return null;
      const data = structuredClone(record.data);
      try {
        const parsed = schema.safeParse(data);
        return parsed.success ? { status: "known", record, data: parsed.data } : { status: "unknown", record, reason: "invalid_data" };
      } catch { return { status: "unknown", record, reason: "invalid_data" }; }
    },
  };
}
export interface RecordQuery { readonly scope: "path" | "session" }
/** 固定在一次读取位置的会话视图；await 之后不切换到最新状态。 */
export interface SessionView {
  readonly id: string;
  readonly title: string;
  readonly records: {
    all(query: RecordQuery): readonly SessionRecord[];
    /** 最早一条匹配记录；不可解码时返回 unknown，不跳过。 */
    first<D extends Json>(contract: RecordContract<D>, query: RecordQuery): Decoded<D> | null;
    /** 最新一条匹配记录；按契约索引定位，仅解码该记录；不可解码时返回 unknown，不回退。 */
    last<D extends Json>(contract: RecordContract<D>, query: RecordQuery): Decoded<D> | null;
    query<D extends Json>(contract: RecordContract<D>, query: RecordQuery): Decoded<D>[];
  };
}
