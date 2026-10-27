import type { z } from "zod";
import type { Json } from "./json.ts";
import type { Source } from "./workspace.ts";

/** Public envelope for session records: the host maps its storage format to this envelope, and plugins decode by contract without depending on internal node structure. */
export interface RecordRef { readonly id: string }
export interface SessionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly parentId: string | null;
  /** Append order within the session, starting at 1. */
  readonly sequence: number;
  readonly createdAt: string;
  readonly contract: RecordRef;
  /** Writer; stamped by the host according to the write channel, while the associated object belongs in data. */
  readonly source: Source;
  /** Model-visible text written by the platform, consumed when executors project context; recipient being null means all executors. */
  readonly context: { readonly text: string; readonly recipient: string | null } | null;
  readonly data: Json;
}
export type Decoded<D> =
  | { readonly status: "known"; readonly record: SessionRecord; readonly data: D }
  | { readonly status: "unknown"; readonly record: SessionRecord; readonly reason: "invalid_data" };
export interface RecordContract<D extends Json = Json> extends RecordRef {
  readonly schema: z.ZodType<D>;
  /** Return null when the record does not belong to this contract; compatibility and transformations are determined by the schema, and failure preserves the raw record. */
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
/** timeline reads the complete ancestor path to the snapshot tip; session reads all session records within the snapshot's upper bound in save order. */
export interface RecordQuery { readonly scope: "timeline" | "session" }
/** An observation handle fixed at one read position; reads records on demand and does not switch to the latest state after await. */
export interface SessionView {
  readonly id: string;
  readonly title: string;
  readonly records: {
    all(query: RecordQuery): readonly SessionRecord[];
    /** The earliest matching record; returns unknown if it cannot be decoded, without skipping it. */
    first<D extends Json>(contract: RecordContract<D>, query: RecordQuery): Decoded<D> | null;
    /** The latest matching record, located by scope and contract; decodes only that record and returns unknown if undecodable, without falling back. */
    last<D extends Json>(contract: RecordContract<D>, query: RecordQuery): Decoded<D> | null;
    query<D extends Json>(contract: RecordContract<D>, query: RecordQuery): Decoded<D>[];
  };
}
