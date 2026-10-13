import type { ModelItem, ModelPart as ProjectedPart } from "@atelier/sdk/contracts";
import type { SessionNode } from "../shared/session.ts";
import { SessionError } from "../shared/session-timeline.ts";
import { projectForAgent as projectRecords } from "../modules/agent/projection.ts";
import { sessionView } from "../plugins/records.ts";
import { nodeView } from "./view.ts";

export type { ModelItem, ModelPart as ProjectedPart } from "@atelier/sdk/contracts";

/** 宿主内部节点视图通过领域记录投影模型上下文。 */
export function projectForAgent(path: readonly SessionNode[], agentId: string): ModelItem[] {
  try { return projectRecords(sessionView(nodeView(path[0]?.sessionId ?? "", "", path, path.at(-1)?.id ?? null)), agentId); }
  catch (error) { throw new SessionError("invalid_request", error instanceof Error ? error.message : "The conversation projection is unavailable."); }
}
