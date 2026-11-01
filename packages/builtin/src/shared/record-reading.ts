import type { RecordQuery, SessionRecord } from "@asterism-app/sdk/contracts";

/** A read plan owns selection and projection; its caller supplies local or remote body reads. */
export type RecordRead<T> = Generator<RecordQuery, T, readonly SessionRecord[]>;

export function readRecords<T>(plan: RecordRead<T>, read: (query: RecordQuery) => readonly SessionRecord[]): T {
  let next = plan.next();
  while (!next.done) next = plan.next(read(next.value));
  return next.value;
}

export async function readRecordsAsync<T>(plan: RecordRead<T>, read: (query: RecordQuery) => Promise<readonly SessionRecord[]>,
  signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  let next = plan.next();
  while (!next.done) {
    const records = await read(next.value);
    signal?.throwIfAborted();
    next = plan.next(records);
  }
  return next.value;
}
