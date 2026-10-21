import { SessionController, type SessionView } from "./controller";
import { objectRetention } from "./retention";

/**
 * 每个会话一个控制器；卡片与浮岛共享同一控制器。
 * 视图态跟随会话可见性：最后一个连接断开且没有在途命令时释放控制器及其投影，再次进入时重新读取。
 * 保留意图跟随对象存在：每份就绪投影发布后，释放不在其中的对象保留状态。
 */
const controllers = new Map<string, SessionController>();

export function sessionController(sessionId: string): SessionController {
  let controller = controllers.get(sessionId);
  if (!controller) {
    const created: SessionController = new SessionController(window.host.session, sessionId, () => {
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
