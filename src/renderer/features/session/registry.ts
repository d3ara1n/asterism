import { runtime } from "../../runtime";
import { SessionController, type SessionView } from "./controller";
import { objectRetention } from "./retention";

/**
 * One controller per session; cards and islands share the same controller.
 * View state follows session visibility: release the controller and its projection after the last connection disconnects and no commands remain in flight; reread on reentry.
 * Retained intent follows object presence: after publishing each ready projection, release retained state for objects absent from it.
 */
const controllers = new Map<string, SessionController>();

export function sessionController(sessionId: string): SessionController {
  let controller = controllers.get(sessionId);
  if (!controller) {
    const created: SessionController = new SessionController(runtime.session, sessionId, () => {
      if (controllers.get(sessionId) === created) controllers.delete(sessionId);
    });
    let swept: SessionView | null = null;
    created.subscribe(() => {
      const { status, data } = created.getSnapshot();
      if (status !== "ready" || !data || data === swept) return;
      swept = data;
      objectRetention.retainOnly(sessionId, new Set(data.workbench.objects.map(object => object.id)));
    });
    controllers.set(sessionId, controller = created);
  }
  return controller;
}
