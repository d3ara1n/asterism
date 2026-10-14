import { PluginApiError, type ObjectExecutor, type ObjectReader, type PluginTasks, type ModelServices } from "@atelier/sdk/runtime";
import { ResourceStatusChanged, type ResourceStatus } from "@atelier/sdk/contracts";
import { Execution, Notice } from "./records.ts";
import { selectionOf, type AgentSelectionService } from "./selection.ts";
import { composeSystemPrompt } from "./system-prompt.ts";
import { projectForAgent } from "./projection.ts";
import { compressContext } from "./compression.ts";

const key = (object: ObjectReader) => `agent:${object.ref.id}`;
/** 执行循环只持请求次数，消息始终从时间线重建。 */
export function createAgentLoop(deps: { selection: AgentSelectionService; tasks: PluginTasks; models: ModelServices }) {
  return {
    running: (object: ObjectReader) => deps.tasks.has(key(object)),
    cancel: (object: ObjectReader) => deps.tasks.cancel(key(object)),
    start(object: ObjectExecutor) {
      const initial = deps.selection.agent(selectionOf(object).selection);
      const compress = (signal: AbortSignal) => {
        const selection = selectionOf(object).selection;
        const system = composeSystemPrompt(deps.selection.agent(selection));
        const tokens = Math.ceil(system.blocks.reduce((size, block) => size + block.text.length, 0) / 4);
        return compressContext(object, deps.selection.target(selection), tokens, deps.models, signal);
      };
      const publish = (status: ResourceStatus["status"]) => object.events.publish(ResourceStatusChanged, {
        title: object.snapshot()!.title, status,
      });
      const started = deps.tasks.start(key(object), async signal => {
        let status: ResourceStatus["status"] = "failed";
        publish("running");
        try {
          for (let request = 0; ; request++) {
            signal.throwIfAborted();
            if (request >= (deps.selection.agent(selectionOf(object).selection).maxTurns ?? 32)) {
              object.commit(writer => { writer.append(Notice, { level: "error", code: "request_limit",
                message: "The agent reached the model request limit. Continue explicitly to resume." }); });
              status = "awaiting";
              return;
            }
            const compressed = await compress(signal);
            // 摘要期间环境可变；真正的工作请求重新取用选择、配置和时间线。
            const selection = selectionOf(object).selection, agent = deps.selection.agent(selection);
            const snapshot = object.session.snapshot();
            const result = await deps.models.run({ object: object.ref, requestParentId: snapshot.position.nodeId,
              target: deps.selection.target(selection), system: composeSystemPrompt(agent), messages: projectForAgent(snapshot, object.ref.id), signal,
              tools: deps.selection.tools(agent), cache: { expectHit: request > 0 && !compressed }, observer: { event(event) {
                if (event.type !== "progress") object.commit(writer => { writer.append(Execution, event); });
              } },
            });
            // 事件提交失败时请求已中止且无法写入诊断；在循环层补一条可见通知，避免静默停止。
            if (result.reason === "failed" && result.code === "event_delivery") {
              object.commit(writer => { writer.append(Notice, { level: "error", code: "event_delivery",
                message: "The model response could not be saved to the timeline. Execution stopped." }); });
              return;
            }
            if (result.reason !== "completed" || result.tools.length === 0) {
              if (result.reason === "completed") await compress(signal);
              status = result.reason === "cancelled" ? "awaiting" : result.reason;
              return;
            }
          }
        } catch (error) {
          status = signal.aborted ? "awaiting" : "failed";
          object.commit(writer => { writer.append(Notice, signal.aborted
            ? { level: "warning", code: "cancelled", message: "Execution was cancelled." }
            : { level: "error", code: error instanceof PluginApiError ? error.code : "execution_failed",
              message: error instanceof PluginApiError ? error.message : "Execution could not be completed." }); });
        } finally {
          publish(status);
        }
      }, { object: object.ref, timeoutMs: (initial.timeout ?? 600) * 1000 });
      if (!started) throw new PluginApiError("conflict", "This agent is running. Cancel or wait for it to finish.");
    },
  };
}
