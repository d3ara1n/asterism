import type { z } from "zod";
import type { Json } from "./json.ts";

/** 会话记录的公开信封：宿主把存储格式映射为它，插件按契约解码，不依赖内部节点结构。 */
export interface RecordRef { readonly id: string; readonly version: number }
export interface SessionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly parentId: string | null;
  /** 会话内追加顺序，从 1 开始。 */
  readonly sequence: number;
  readonly createdAt: string;
  readonly contract: RecordRef;
  /** 关联对象；不预设发送者或执行者。 */
  readonly resource: { readonly id: string; readonly kind: string } | null;
  readonly data: Json;
}
export type Decoded<D> =
  | { readonly status: "known"; readonly record: SessionRecord; readonly data: D }
  | { readonly status: "unknown"; readonly record: SessionRecord; readonly reason: "unsupported_version" | "invalid_data" };
export interface RecordContract<D extends Json = Json> extends RecordRef {
  readonly schema: z.ZodType<D>;
  /** 不属于该契约返回 null；旧版本经 upgrade 升到当前版本再校验。 */
  decode(record: SessionRecord): Decoded<D> | null;
}
export function defineRecord<D extends Json>(id: string, definition: {
  version: number; schema: z.ZodType<D>; upgrade?: Readonly<Record<number, (data: Json) => Json>>;
}): RecordContract<D> {
  const { version, schema, upgrade = {} } = definition;
  return {
    id, version, schema,
    decode(record) {
      if (record.contract.id !== id) return null;
      let data = record.data;
      for (let from = record.contract.version; from < version; from++) {
        const step = upgrade[from];
        if (!step) return { status: "unknown", record, reason: "unsupported_version" };
        data = step(data);
      }
      if (record.contract.version > version) return { status: "unknown", record, reason: "unsupported_version" };
      const parsed = schema.safeParse(data);
      return parsed.success ? { status: "known", record, data: parsed.data } : { status: "unknown", record, reason: "invalid_data" };
    },
  };
}
export interface RecordQuery { readonly scope: "path" | "session" }
/** 固定在一次读取位置的会话视图；await 之后不切换到最新状态。 */
export interface SessionView {
  readonly id: string;
  readonly title: { readonly text: string; readonly version: number; readonly source: "provisional" | "automatic" | "user" };
  readonly records: {
    all(query: RecordQuery): readonly SessionRecord[];
    /** 最早一条匹配记录；不可解码时返回 unknown，不跳过。 */
    first<D extends Json>(contract: RecordContract<D>, query: RecordQuery): Decoded<D> | null;
    query<D extends Json>(contract: RecordContract<D>, query: RecordQuery): Decoded<D>[];
  };
}
