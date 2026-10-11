import type { Json, RecordContract } from "@atelier/sdk/contracts";
import type { ResourceRef } from "@atelier/sdk/runtime";
import type { SessionHostWriter } from "./host.ts";
import { appendCoreRecord } from "./core-record-writer.ts";

/** 通用插件记录保存身份和数据；core 原生格式经专门适配器编码。 */
export function appendRecord(writer: SessionHostWriter, contract: RecordContract, data: Json, resource?: ResourceRef): string {
  return appendCoreRecord(writer, contract, data, resource) ?? writer.append({ kind: "event", type: contract.id,
    data, agentId: resource?.id ?? null, model: null });
}
