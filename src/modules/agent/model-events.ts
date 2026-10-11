import type { ModelRunObserver } from "@atelier/sdk/contracts";
import type { PluginSession } from "../../plugins/contract.ts";
import { emptyCompletion, type LiveBlock } from "../../shared/session.ts";

/** 将一次执行交付的数据提交到既有时间轴格式；只暂存终态所需的节点身份。 */
export function modelEvents(session: PluginSession, objectId: string, progress: (blocks: LiveBlock[]) => void): ModelRunObserver {
  const ids = new Map<number, string>();
  return { event(event) {
    switch (event.type) {
      case "progress": progress(event.blocks.map(block => ({ ...block, agentId: objectId }))); return;
      case "diagnostic":
        session.commit(writer => writer.append({ kind: "notice", agentId: objectId, code: event.code, message: event.message, level: event.level }));
        return;
      case "block": {
        const { source, completion: _completion, ...block } = event.block;
        const id = session.commit(writer => writer.append({ ...block, ...emptyCompletion, agentId: objectId,
          model: source.model, adapter: source.adapter, scope: source.scope }));
        ids.set(block.ordinal, id);
        return;
      }
      case "completion": {
        if (event.ordinal !== null) {
          const id = ids.get(event.ordinal);
          if (!id) throw new Error("The terminal response block has not been committed.");
          session.commit(writer => writer.completeBlock(id, event.completion));
        } else session.commit(writer => writer.append({ kind: "notice", agentId: objectId, level: "error", code: "empty_response",
          message: "The provider finished without returning any content blocks.",
          response: { responseId: event.responseId, requestParentId: event.requestParentId, model: event.source.model, ...event.completion } }));
        ids.clear();
      }
    }
  } };
}
