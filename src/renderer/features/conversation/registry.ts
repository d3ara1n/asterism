import { SessionController, SubmissionIdentity } from "./controller";

/** 每个会话一个控制器；每个代理卡片一个草稿提交身份。卡片与历史浮岛共享同一控制器。 */
export interface AgentView { controller: SessionController; agentId: string; submission: SubmissionIdentity }
const controllers = new Map<string, SessionController>();
const submissions = new Map<string, SubmissionIdentity>();

export function sessionController(sessionId: string): SessionController {
  let controller = controllers.get(sessionId);
  if (!controller) { controller = new SessionController(window.weft.session, sessionId); controllers.set(sessionId, controller); }
  return controller;
}
export function agentView(sessionId: string, agentId: string): AgentView {
  const key = `${sessionId}:${agentId}`;
  let submission = submissions.get(key);
  if (!submission) { submission = new SubmissionIdentity(); submissions.set(key, submission); }
  return { controller: sessionController(sessionId), agentId, submission };
}
