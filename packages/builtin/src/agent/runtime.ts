import { composeSystemPrompt } from "./system-prompt.ts";
import type { BuiltinApplication } from "../application.ts";
import { AgentView, AgentSelection, AgentDrafts } from "./data.ts";
import { defineModule, implementResource, implementCreation, implementAction } from "@atelier/sdk/runtime";
import {
  Agent, CreateAgent, SubmitAgentInput, ContinueAgent, ConfigureAgent, CancelAgent, AgentConfigurations,
  AgentInputMessage, Execution, Notice, ContextSummary,
} from "@atelier/builtin-api/contracts";
import { createSelection, selectionOf } from "./selection.ts";
import { createAgentLoop } from "./loop.ts";
import { createAdmission } from "./admission.ts";
import { projectAgentTurnState } from "./state-projection.ts";
import { agentExecutionState } from "./state.ts";
import type { AgentTurnState } from "./state.ts";
import type { UsageConsumer } from "../usage/service.ts";
import { createPeekTool } from "./peek/runtime.ts";
import { AgentExecutionFeedback } from "./feedback.ts";
import { SaveAgentDraft, SetAgentDraftMode, ExchangeAgentDraft } from "./drafts-contract.ts";
import { saveDraft, setDraftMode, exchangeDraft } from "./drafts.ts";
import { createSendTool } from "./send/runtime.ts";
import { createWaitTool } from "./wait/runtime.ts";

/** 资源入口只装配领域模块与贡献；业务模块不依赖完整插件上下文。 */
export function createAgentModule(application: BuiltinApplication, usage: UsageConsumer) {
  return defineModule(plugin => {
    const systemPrompt = (agent: Parameters<typeof composeSystemPrompt>[0]) => composeSystemPrompt(agent, application.name);
    const selection = createSelection({ agents: () => plugin.catalogs.get(AgentConfigurations) ?? [] });
    const loop = createAgentLoop({ selection, tasks: plugin.tasks, models: plugin.models, systemPrompt, userAgent: application.userAgent,
      usage });
    const admission = createAdmission({ selection, validate: plugin.models.validate, running: loop.running, systemPrompt });
    // 草稿与配置更新复用当前路径的回合状态；历史位置改变时才重新推导。
    const turns = new Map<string, { nodeId: string | null; state: AgentTurnState }>();
    return {
      events: [AgentExecutionFeedback],
      tools: [createPeekTool(plugin.models, application.userAgent, usage), createSendTool(), createWaitTool(loop)],
      resources: [implementResource(Agent, AgentView, {
        records: [AgentInputMessage, Execution, Notice, ContextSummary],
        links: { receive: true, tools: object => selection.tools(selection.agent(selectionOf(object).selection)) },
        creation: implementCreation(CreateAgent, {
          prepare(input) { selection.validate(input.selection); return { action: "accept" }; },
          create(input, object) {
            object.commit(writer => { writer.set(AgentSelection, { selection: input.selection }); });
            return { title: input.title ?? selection.agent(input.selection).name, data: {} };
          },
        }),
        project(_data, object) {
          const value = object.get(AgentSelection);
          const drafts = object.get(AgentDrafts) ?? [];
          if (loop.running(object))
            return { agentId: object.ref.id, selection: value?.selection ?? null, executionState: "running" as const, drafts };
          const history = object.session.snapshot();
          let turn = turns.get(object.ref.id);
          if (!turn || turn.nodeId !== history.position.nodeId) {
            turn = { nodeId: history.position.nodeId, state: projectAgentTurnState(history, object.ref.id) };
            turns.set(object.ref.id, turn);
          }
          return { agentId: object.ref.id, selection: value?.selection ?? null,
            executionState: agentExecutionState(turn.state, false), drafts };
        },
        async inspect(_data, object) {
          return { type: Agent.kind, title: object.snapshot()?.title ?? "Agent" };
        },
        actions: [
          implementAction(SaveAgentDraft, { async execute(input, object) { saveDraft(object, input); } }),
          implementAction(SetAgentDraftMode, { async execute(input, object) { setDraftMode(object, input); } }),
          implementAction(ExchangeAgentDraft, { async execute(input, object) { exchangeDraft(object, input); } }),
          implementAction(SubmitAgentInput, {
            async prepare(input, { object, signal, content }) { await admission.prepareSubmit(input, object, signal, content); return { action: "accept" }; },
            async execute(input, object) { if (admission.submit(input, object)) loop.start(object); },
          }),
          implementAction(ContinueAgent, {
            async prepare(_input, { object, signal, content }) { await admission.prepareResume(object, signal, content); return { action: "accept" }; },
            async execute(_input, object) { admission.resume(object); loop.start(object); },
          }),
          implementAction(ConfigureAgent, { async execute(input, object) {
            object.commit(writer => {
              const current = selectionOf(object);
              selection.validate(input.selection, current.selection);
              writer.set(AgentSelection, { selection: input.selection });
            });
          } }),
          implementAction(CancelAgent, { async execute(_input, object) { loop.cancel(object); } }),
        ],
      })],
    };
  });
}
