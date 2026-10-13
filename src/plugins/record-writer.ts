import type { Json, RecordContract, RecordSource } from "@atelier/sdk/contracts";
import type { SessionHostWriter } from "./host.ts";

/** 插件记录统一保存契约、来源与载荷；宿主不解释领域数据。 */
export function appendRecord(writer: SessionHostWriter, contract: RecordContract, data: Json, source: RecordSource, options?: { audit?: boolean }): string {
  return writer.append({ contract: contract.id, data, source, model: null, recipient: null, position: !options?.audit });
}
