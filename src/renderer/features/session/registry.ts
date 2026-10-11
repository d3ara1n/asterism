import { SessionController } from "./controller";

/** 每个会话一个控制器；卡片与历史浮岛共享同一控制器。 */
const controllers = new Map<string, SessionController>();

export function sessionController(sessionId: string): SessionController {
  let controller = controllers.get(sessionId);
  if (!controller) { controller = new SessionController(window.host.session, sessionId); controllers.set(sessionId, controller); }
  return controller;
}
