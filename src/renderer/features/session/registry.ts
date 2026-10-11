import { SessionController, SubmissionIdentity } from "./controller";

/** 每个会话一个控制器；每个对象一个提交身份。卡片与历史浮岛共享同一控制器。 */
const controllers = new Map<string, SessionController>();
const submissions = new Map<string, SubmissionIdentity>();

export function sessionController(sessionId: string): SessionController {
  let controller = controllers.get(sessionId);
  if (!controller) { controller = new SessionController(window.host.session, sessionId); controllers.set(sessionId, controller); }
  return controller;
}
export function objectSubmission(sessionId: string, objectId: string): SubmissionIdentity {
  const key = `${sessionId}:${objectId}`;
  let submission = submissions.get(key);
  if (!submission) { submission = new SubmissionIdentity(); submissions.set(key, submission); }
  return submission;
}
