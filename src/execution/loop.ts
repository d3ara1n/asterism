import { randomUUID } from "node:crypto";
import { modelExpression, modelScope, type ModelSettings } from "../shared/model.ts";
import type { AgentConfiguration } from "../shared/configuration.ts";
import type { BlockCompletion, LiveBlock, NewNode } from "../shared/session.ts";
import { ModelFailure, type ModelAdapter } from "../model/contract.ts";
import { composeSystemPrompt } from "../model/system-prompt.ts";
import type { ModelItem } from "../session/projection.ts";
import { SessionError } from "../shared/session-path.ts";
import { executeCoreBatch, coreDeclarations } from "./core.ts";
import type { AgentCapabilities } from "./capabilities.ts";
import { ResponseBuffer } from "./response.ts";

export interface RequestEnvironment {
  adapter: ModelAdapter;
  agent: AgentConfiguration;
  settings: ModelSettings;
  capabilities: AgentCapabilities;
  messages: ModelItem[];
  requestParentId: string | null;
  context: { file: string; text: string }[];
}
export interface RunOptions {
  agentId: string;
  signal: AbortSignal;
  /** 只提交成型记录；身份、追加位置、事务与持久通知由会话入口处理。 */
  append: (node: NewNode) => string;
  complete: (blockId: string, completion: BlockCompletion) => void;
  progress?: (blocks: LiveBlock[]) => void;
  /** 每次请求前重新解析配置、选择与环境文件；不写入会话树。 */
  environment: () => Promise<RequestEnvironment>;
}

/** 一轮执行：请求准备、内存流块、工具批次收束；成型记录提交给会话。 */
export async function runAgent(options: RunOptions): Promise<void> {
  const { agentId, signal, append } = options;
  const notice = (code: string, message: string, level: "error" | "warning" = "error") =>
    append({ kind: "notice", agentId, level, code, message });
  try {
    for (let request = 0; ; request++) {
      signal.throwIfAborted();
      const { adapter, agent, settings, capabilities, messages, requestParentId, context } = await options.environment();
      signal.throwIfAborted();
      if (agent.maxCost !== null) throw new ModelFailure("unavailable", "Cost limits require model pricing support, which is not available yet.");
      if (request >= (agent.maxTurns ?? 32)) throw new ModelFailure("request_limit", "The agent reached the model request limit. Continue explicitly to resume.");
      const prepared = adapter.prepare({ settings, system: composeSystemPrompt(agent, context), messages,
        tools: settings.model.capabilities.tools ? coreDeclarations() : [] });
      const responseId = randomUUID();
      const model = modelExpression(settings);
      const response = new ResponseBuffer({ agentId, responseId, requestParentId, model, adapter: adapter.version, scope: modelScope(settings) },
        append, (blockId, completion) => {
          if (blockId) {
            options.complete(blockId, completion);
          } else append({ kind: "notice", agentId, level: "error", code: "empty_response",
            message: "The provider finished without returning any content blocks.",
            response: { responseId, requestParentId, model, ...completion } });
        });
      try {
        for await (const event of prepared.stream(signal)) {
          signal.throwIfAborted();
          response.accept(event);
          options.progress?.(response.live());
        }
        signal.throwIfAborted();
        const finish = response.finish;
        if (!finish) throw new ModelFailure("interrupted", "The model stream ended without a terminal response.");
        if (!["stop", "tool-calls"].includes(finish.reason)) {
          throw new ModelFailure("incomplete", "The model response did not finish normally. No tools were executed.");
        }
        const calls = response.calls();
        const byCall = new Map(calls.map(call => [call.part.callId, call]));
        let unknown = false;
        await executeCoreBatch(calls.map(call => ({ callId: call.part.callId, name: call.part.name, arguments: call.arguments })),
          settings.model.capabilities.tools ? capabilities : null, signal, (call, outcome) => {
            if (outcome.kind === "unknown") unknown = true;
            response.settle(byCall.get(call.callId)!, outcome);
            options.progress?.(response.live());
          }, {
            prepared(call, info) {
              response.prepare(byCall.get(call.callId)!, info);
              options.progress?.(response.live());
            },
            started(call, info) {
              response.start(byCall.get(call.callId)!, info);
              options.progress?.(response.live());
            },
            published(call, data) {
              response.publish(byCall.get(call.callId)!, data);
              options.progress?.(response.live());
            },
          });
        if (request > 0 && finish.usage?.cacheRead === 0 && (finish.usage.input ?? 0) > 2048) {
          notice("cache_miss", "The provider reported no cached input for this request.", "warning");
        }
        if (settings.model.contextWindow && (finish.usage?.input ?? 0) > settings.model.contextWindow * 0.8) {
          notice("context_budget", "Context usage is above 80% of the model's window.", "warning");
        }
        if (unknown) throw new ModelFailure("unknown_outcome", "A tool outcome is unknown. Automatic continuation stopped.");
        signal.throwIfAborted();
        if (!calls.length) return;
      } finally {
        try {
          response.close();
        } finally { options.progress?.([]); }
      }
    }
  } catch (error) {
    if (signal.aborted) notice("cancelled", "Execution was cancelled.", "warning");
    else {
      const known = error instanceof ModelFailure || error instanceof SessionError;
      notice(known ? error.code : "execution_failed", known ? error.message : "Execution could not be completed.");
    }
  }
}
