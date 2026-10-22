import { PluginApiError, type ObjectExecutor, type ObjectReader, type PluginTasks, type ModelServices } from "@atelier/sdk/runtime";
import { ResourceStatusChanged, type ResourceStatus, type ModelRunObserver } from "@atelier/sdk/contracts";
import { Execution, Notice } from "@atelier/builtin-api/contracts";
import { agentRequestExtensions } from "./request-context.ts";
import { AgentExecutionFeedback } from "./feedback.ts";
import { selectionOf, type AgentSelectionService } from "./selection.ts";
import type { composeSystemPrompt } from "./system-prompt.ts";
import { projectForAgent } from "./projection.ts";
import { compressContext } from "./compression.ts";
import { deliverDrafts } from "./drafts.ts";
import type { UsageConsumer } from "../usage/service.ts";

type AgentDefinition = Parameters<typeof composeSystemPrompt>[0];
interface AgentLoopDependencies {
  selection: AgentSelectionService;
  tasks: PluginTasks;
  models: ModelServices;
  systemPrompt: (agent: AgentDefinition) => ReturnType<typeof composeSystemPrompt>;
  userAgent: string;
  usage?: Pick<UsageConsumer, "consume">;
}

/** 循环持有执行计数；消息和回合边界从时间线读取，待发送输入由资源持有。 */
export function createAgentLoop(deps: AgentLoopDependencies) {
  // 资源输入受理依赖仍会消费消息的循环；宿主任务稍后的清理仍由其生命周期跟踪。
  const active = new Map<string, { key: string; entered: boolean }>();
  const waiters = new Map<string, Set<() => void>>();
  // 循环退出（正常结束、失败、取消或未能启动）都经此移除运行，并唤醒等待该代理收束的调用。
  const finish = (id: string) => {
    active.delete(id);
    const pending = waiters.get(id);
    waiters.delete(id);
    for (const wake of pending ?? []) wake();
  };
  let execution = 0;
  const running = (object: ObjectReader) => {
    const run = active.get(object.ref.id);
    return !!run && deps.tasks.has(run.key);
  };
  return {
    running,
    /** 等待当前执行循环退出；未运行时立即兑现。退出后交付的新输入开启新循环，由调用方按需再次等待。 */
    settled(object: ObjectReader, signal: AbortSignal): Promise<void> {
      signal.throwIfAborted();
      if (!running(object)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const set = waiters.get(object.ref.id) ?? new Set<() => void>();
        waiters.set(object.ref.id, set);
        const abort = () => { set.delete(wake); reject(signal.reason); };
        const wake = () => { signal.removeEventListener("abort", abort); resolve(); };
        set.add(wake);
        signal.addEventListener("abort", abort, { once: true });
      });
    },
    cancel(object: ObjectExecutor) {
      const run = active.get(object.ref.id);
      if (!run) return;
      deps.tasks.cancel(run.key);
      // 宿主在调用任务体之前就收到取消时，不会进入任务体的 finally。
      if (!run.entered) { finish(object.ref.id); object.invalidate(); }
    },
    start(object: ObjectExecutor) {
      const previous = active.get(object.ref.id);
      if (previous && deps.tasks.has(previous.key)) throw new PluginApiError("conflict", "This agent is running. Cancel or wait for it to finish.");
      const run = { key: `agent:${object.ref.id}:${++execution}`, entered: false };
      const compress = (signal: AbortSignal) => {
        const selection = selectionOf(object).selection;
        const system = deps.systemPrompt(deps.selection.agent(selection));
        const tokens = Math.ceil(system.blocks.reduce((size, block) => size + block.text.length, 0) / 4);
        return compressContext(object, deps.selection.target(selection), tokens, deps.models, signal, deps.userAgent);
      };
      const publish = (status: ResourceStatus["status"]) => object.events.publish(ResourceStatusChanged, {
        title: object.snapshot()!.title, status,
      });
      const feedback = (error: unknown, signal: AbortSignal) => object.events.publish(AgentExecutionFeedback, signal.aborted
        ? { level: "warning", code: "cancelled", message: "Execution was cancelled." }
        : { level: "error", code: error instanceof PluginApiError ? error.code : "execution_failed",
          message: error instanceof PluginApiError ? error.message : "Execution could not be completed." });
      active.set(object.ref.id, run);
      let started: boolean;
      try { started = deps.tasks.start(run.key, async signal => {
        run.entered = true;
        let status: ResourceStatus["status"] = "failed";
        try {
          // Agent start 的扩展位置；生命周期观察与拦截由实际消费者接入时定义。
          publish("running");
          // Turn start 的扩展位置；显式继续执行仍属于原回合。
          let request = 0;
          for (;;) {
            signal.throwIfAborted();
            let cancelled = false, completed = false, hasTools = false;
            const requestLimit = deps.selection.agent(selectionOf(object).selection).maxTurns ?? 32;
            if (request >= requestLimit) {
              object.commit(writer => { writer.append(Notice, { level: "error", code: "request_limit",
                message: "The agent reached the model request limit. Continue explicitly to resume." }); });
              status = "awaiting";
            } else {
              // 摘要和通知的持久写入失败直接结束执行，不进入模型错误的消费分支。
              const compressed = await compress(signal);
              // Request start 的扩展位置：摘要完成后固定本次上下文、配置与授权。
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
              let result: Awaited<ReturnType<ModelServices["run"]>> | undefined;
              try {
                result = await deps.models.run({ object: object.ref, requestParentId: snapshot.position.nodeId,
                  userAgent: deps.userAgent, completionExtensions: agentRequestExtensions,
                  target: deps.selection.target(selection), system: deps.systemPrompt(agent), messages: projectForAgent(snapshot, object.ref.id), signal,
                  tools: deps.selection.tools(agent), cache: { expectHit: request > 0 && !compressed }, observer,
                });
              } catch (error) {
                cancelled = signal.aborted;
                status = cancelled ? "awaiting" : "failed";
                feedback(error, signal);
              }
              request++;
              if (result) {
                if (result.response) deps.usage?.consume(result.response);
                if (result.reason === "failed" && result.code === "event_delivery") {
                  status = "failed";
                  object.events.publish(AgentExecutionFeedback, { level: "error", code: "event_delivery",
                    message: "The model response could not be saved to the timeline. Execution stopped." });
                  return;
                }
                // Request end：包含该响应的完整工具批次；取消后保留所有待发送输入。
                cancelled = signal.aborted || result.reason === "cancelled";
                completed = result.reason === "completed";
                hasTools = result.tools.length > 0;
                status = result.reason === "cancelled" ? "awaiting" : result.reason;
              }
            }
            if (cancelled || signal.aborted) { status = "awaiting"; return; }
            if (completed) {
              if (request < requestLimit && deliverDrafts(object, "request")) continue;
              if (hasTools) continue;
              await compress(signal);
            }
            // Turn end 与 Agent settled 独立；正常结束、错误和请求上限均可交付下一批。
            signal.throwIfAborted();
            if (!deliverDrafts(object, "turn")) return;
            // 下一批输入已原子交付；此处进入新的 turn。
            request = 0;
          }
        } catch (error) {
          status = signal.aborted ? "awaiting" : "failed";
          feedback(error, signal);
        } finally {
          // 从此处开始的新输入启动新循环，不会落入已经停止消费的旧循环。
          finish(object.ref.id);
          object.invalidate();
          publish(status);
          // Agent settled 由宿主等待任务和相关活动真实结束后判定。
        }
      }, { object: object.ref }); }
      catch (error) { finish(object.ref.id); throw error; }
      if (!started) {
        finish(object.ref.id);
        throw new PluginApiError("unavailable", "The agent execution could not be started.");
      }
      object.invalidate();
    },
  };
}
