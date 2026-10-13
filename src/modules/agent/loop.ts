import { PluginApiError, type ObjectExecutor, type ObjectReader, type PluginTasks, type ModelServices } from "@atelier/sdk/runtime";
import { Execution, Notice } from "./records.ts";
import { selectionOf, type AgentSelectionService } from "./selection.ts";
import { composeSystemPrompt } from "./system-prompt.ts";
import { projectForAgent } from "./projection.ts";

const key = (object: ObjectReader) => `agent:${object.ref.id}`;
/** 执行循环只持请求次数，消息始终从时间线重建。 */
export function createAgentLoop(deps: { selection: AgentSelectionService; tasks: PluginTasks; run: ModelServices["run"] }) {
  return {
    running: (object: ObjectReader) => deps.tasks.has(key(object)),
    cancel: (object: ObjectReader) => deps.tasks.cancel(key(object)),
    start(object: ObjectExecutor) {
      const initial = deps.selection.agent(selectionOf(object).selection);
      const started = deps.tasks.start(key(object), async signal => {
        try {
          for (let request = 0; ; request++) {
            signal.throwIfAborted();
            const selection = selectionOf(object).selection, agent = deps.selection.agent(selection);
            if (request >= (agent.maxTurns ?? 32)) {
              object.commit(writer => { writer.append(Notice, { level: "error", code: "request_limit",
                message: "The agent reached the model request limit. Continue explicitly to resume." }); });
              return;
            }
            const snapshot = object.session.snapshot();
            const result = await deps.run({ object: object.ref, requestParentId: snapshot.position.nodeId,
              target: deps.selection.target(selection), system: composeSystemPrompt(agent), messages: projectForAgent(snapshot, object.ref.id), signal,
              tools: deps.selection.tools(agent), cache: { expectHit: request > 0 }, observer: { event(event) {
                if (event.type !== "progress") object.commit(writer => { writer.append(Execution, event); });
              } },
            });
            // 事件提交失败时请求已中止且无法写入诊断；在循环层补一条可见通知，避免静默停止。
            if (result.reason === "failed" && result.code === "event_delivery") {
              object.commit(writer => { writer.append(Notice, { level: "error", code: "event_delivery",
                message: "The model response could not be saved to the timeline. Execution stopped." }); });
              return;
            }
            if (result.reason !== "completed" || result.tools.length === 0) return;
          }
        } catch (error) {
          object.commit(writer => { writer.append(Notice, signal.aborted
            ? { level: "warning", code: "cancelled", message: "Execution was cancelled." }
            : { level: "error", code: error instanceof PluginApiError ? error.code : "execution_failed",
              message: error instanceof PluginApiError ? error.message : "Execution could not be completed." }); });
        }
      }, { object: object.ref, timeoutMs: (initial.timeout ?? 600) * 1000 });
      if (!started) throw new PluginApiError("conflict", "This agent is running. Cancel or wait for it to finish.");
    },
  };
}
