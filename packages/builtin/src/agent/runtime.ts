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
import type { UsageConsumer } from "../usage/service.ts";
import { createPeekTool } from "./peek/runtime.ts";
import { AgentExecutionFeedback } from "./feedback.ts";
import { SaveAgentDraft, SetAgentDraftMode, ExchangeAgentDraft } from "./drafts-contract.ts";
import { saveDraft, setDraftMode, exchangeDraft } from "./drafts.ts";
import { createSendTool } from "./send/runtime.ts";

/** 资源入口只装配领域模块与贡献；业务模块不依赖完整插件上下文。 */
export function createAgentModule(application: BuiltinApplication, usage: UsageConsumer) {
  return defineModule(plugin => {
    const systemPrompt = (agent: Parameters<typeof composeSystemPrompt>[0]) => composeSystemPrompt(agent, application.name);
    const selection = createSelection({ agents: () => plugin.catalogs.get(AgentConfigurations) ?? [] });
    const loop = createAgentLoop({ selection, tasks: plugin.tasks, models: plugin.models, systemPrompt, userAgent: application.userAgent,
      usage });
    const admission = createAdmission({ selection, validate: plugin.models.validate, running: loop.running, systemPrompt });
    return {
      events: [AgentExecutionFeedback],
      tools: [createPeekTool(plugin.models, application.userAgent, usage), createSendTool()],
      resources: [implementResource(Agent, AgentView, {
        records: [AgentInputMessage, Execution, Notice, ContextSummary],
        links: { receive: true, tools: object => selection.tools(selection.agent(selectionOf(object).selection)) },
        creation: implementCreation(CreateAgent, {
          prepare(input) { selection.validate(input.selection); return { action: "accept" }; },
          create(input, object) {
            object.commit(writer => { writer.set(AgentSelection, { selection: input.selection, revision: 1 }); });
            return { title: input.title ?? selection.agent(input.selection).name, data: {} };
          },
        }),
        project(_data, object) {
          const value = object.get(AgentSelection);
          return { agentId: object.ref.id, selection: value?.selection ?? null, selectionRevision: value?.revision ?? 0,
            turnState: projectAgentTurnState(object.session.snapshot(), object.ref.id), drafts: object.get(AgentDrafts) ?? [] };
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
              writer.set(AgentSelection, { selection: input.selection, revision: current.revision + 1 });
            });
          } }),
          implementAction(CancelAgent, { async execute(_input, object) { loop.cancel(object); } }),
        ],
      })],
    };
  });
}
