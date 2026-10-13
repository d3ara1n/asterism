import type { Json, RecordContract, RecordSource } from "@atelier/sdk/contracts";
import type { SessionHostWriter } from "./host.ts";
import { appendCoreRecord } from "./core-record-writer.ts";

/** 通用插件记录保存身份、数据与宿主打戳的来源；core 原生格式经专门适配器编码。 */
export function appendRecord(writer: SessionHostWriter, contract: RecordContract, data: Json, source: RecordSource): string {
  return appendCoreRecord(writer, contract, data, source) ?? writer.append({ kind: "event", type: contract.id,
    data, source, model: null, recipient: null });
}
