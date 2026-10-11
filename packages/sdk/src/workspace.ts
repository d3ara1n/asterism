/** 工作台读取共识：可由后台和前端共同消费，不依赖宿主存储或 Node。 */
import type { Json } from "./json.ts";
import type { ResourceContract } from "./module-contract.ts";
import type { SessionView } from "./records.ts";

export interface ResourceRef { readonly sessionId: string; readonly id: string; readonly kind: string }
export interface ResourceSnapshot<S extends Json = Json> {
  readonly ref: ResourceRef;
  readonly title: string;
  readonly data: S;
}
export interface SessionSnapshot extends SessionView {
  readonly position: { readonly nodeId: string | null; readonly continuationId: string | null };
  readonly resources: {
    all(): readonly ResourceSnapshot[];
    get<S extends Json>(contract: ResourceContract<S>, id: string):
      | { status: "known"; resource: ResourceSnapshot<S> }
      | { status: "unknown"; resource: ResourceSnapshot; reason: "invalid_data" }
      | null;
  };
}
