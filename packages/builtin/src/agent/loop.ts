import { PluginApiError, type ObjectExecutor, type ObjectReader, type PluginTasks, type ModelServices } from "@atelier/sdk/runtime";
import { ResourceStatusChanged, type ResourceStatus, type ModelRunObserver } from "@atelier/sdk/contracts";
import { Execution, Notice } from "@atelier/builtin-api/contracts";
import { agentRequestExtensions } from "./request-context.ts";
import { AgentExecutionFeedback } from "./feedback.ts";
import { selectionOf, type AgentSelectionService } from "./selection.ts";
import type { composeSystemPrompt } from "./system-prompt.ts";
import { projectForAgent } from "./projection.ts";
import { compressContext } from "./compression.ts";
import type { UsageConsumer } from "../usage/service.ts";

const key = (object: ObjectReader) => `agent:${object.ref.id}`;
type AgentDefinition = Parameters<typeof composeSystemPrompt>[0];
interface AgentLoopDependencies {
  selection: AgentSelectionService;
  tasks: PluginTasks;
  models: ModelServices;
  systemPrompt: (agent: AgentDefinition) => ReturnType<typeof composeSystemPrompt>;
  userAgent: string;
  usage?: Pick<UsageConsumer, "consume">;
}

/** 执行循环只持请求次数，消息始终从时间线重建。 */
export function createAgentLoop(deps: AgentLoopDependencies) {
  return {
    running: (object: ObjectReader) => deps.tasks.has(key(object)),
    cancel: (object: ObjectReader) => deps.tasks.cancel(key(object)),
    start(object: ObjectExecutor) {
      const compress = (signal: AbortSignal) => {
        const selection = selectionOf(object).selection;
        const system = deps.systemPrompt(deps.selection.agent(selection));
        const tokens = Math.ceil(system.blocks.reduce((size, block) => size + block.text.length, 0) / 4);
        return compressContext(object, deps.selection.target(selection), tokens, deps.models, signal, deps.userAgent);
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
            let hasBlocks = false;
            const observer: ModelRunObserver = {
              event(event) {
                if (event.type === "progress") return;
                if (event.type === "diagnostic" && !hasBlocks) {
                  object.events.publish(AgentExecutionFeedback, { code: event.code, message: event.message, level: event.level });
                  return;
                }
                object.commit(writer => { writer.append(Execution, event); });
                if (event.type === "block") hasBlocks = true;
              },
            };
            const result = await deps.models.run({ object: object.ref, requestParentId: snapshot.position.nodeId,
              userAgent: deps.userAgent,
              completionExtensions: agentRequestExtensions,
              target: deps.selection.target(selection), system: deps.systemPrompt(agent), messages: projectForAgent(snapshot, object.ref.id), signal,
              tools: deps.selection.tools(agent), cache: { expectHit: request > 0 && !compressed }, observer,
            });
            if (result.response) deps.usage?.consume(result.response);
            // 提交失败由瞬态通道反馈；已提交的实际内容保持原样。
            if (result.reason === "failed" && result.code === "event_delivery") {
              object.events.publish(AgentExecutionFeedback, { level: "error", code: "event_delivery",
                message: "The model response could not be saved to the timeline. Execution stopped." });
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
          object.events.publish(AgentExecutionFeedback, signal.aborted
            ? { level: "warning", code: "cancelled", message: "Execution was cancelled." }
            : { level: "error", code: error instanceof PluginApiError ? error.code : "execution_failed",
              message: error instanceof PluginApiError ? error.message : "Execution could not be completed." });
        } finally {
          publish(status);
        }
      }, { object: object.ref });
      if (!started) throw new PluginApiError("conflict", "This agent is running. Cancel or wait for it to finish.");
    },
  };
}
