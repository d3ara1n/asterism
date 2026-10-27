import { agentCard } from "../shared/card-appearance.ts";
import { composeSystemPrompt } from "./system-prompt.ts";
import type { BuiltinApplication } from "../application.ts";
import { AgentView, AgentSelection, AgentDrafts } from "./data.ts";
import { defineModule, implementResource, implementCreation, implementAction } from "@asterism/sdk/runtime";
import {
  Agent, CreateAgent, SubmitAgentInput, ContinueAgent, ConfigureAgent, CancelAgent, AgentConfigurations,
  AgentInputMessage, Execution, ContextSummary,
} from "@asterism/builtin-api/contracts";
import { createSelection, selectionOf } from "./selection.ts";
import { generateAgentName } from "./name.ts";
import { createAgentLoop } from "./loop.ts";
import { createAdmission } from "./admission.ts";
import { projectAgentTurnState } from "./state-projection.ts";
import { agentExecutionState } from "./state.ts";
import type { AgentTurnState } from "./state.ts";
import type { UsageConsumer } from "../usage/service.ts";
import { createPeekTool } from "./peek/runtime.ts";
import { AgentSoftwareFeedback } from "./feedback.ts";
import { createAgentFeedback } from "./feedback-state.ts";
import { SaveAgentDraft, SetAgentDraftMode, ExchangeAgentDraft, DiscardAgentDraft, MoveAgentDraft } from "./drafts-contract.ts";
import { saveDraft, setDraftMode, exchangeDraft, discardDraft, moveDraft } from "./drafts.ts";
import { createSendTool } from "./send/runtime.ts";
import { createWaitTool } from "./wait/runtime.ts";
import type { SkillCatalog } from "../skills/catalog.ts";

/** The resource entry point only assembles domain modules and contributions; business modules do not depend on the full plugin context. */
export function createAgentModule(application: BuiltinApplication, usage: UsageConsumer, skills: SkillCatalog) {
  return defineModule(plugin => {
    const systemPrompt = (agent: Parameters<typeof composeSystemPrompt>[0]) => {
      const system = composeSystemPrompt(agent, application.name);
      return { blocks: [...system.blocks, skills.prompt()] };
    };
    const selection = createSelection({ agents: () => plugin.catalogs.get(AgentConfigurations) ?? [] });
    const feedback = createAgentFeedback();
    plugin.lifetime.defer(feedback.clear);
    const loop = createAgentLoop({ selection, tasks: plugin.tasks, models: plugin.models, systemPrompt, userAgent: application.userAgent,
      usage, feedback });
    const admission = createAdmission({ selection, validate: plugin.models.validate, running: loop.running, systemPrompt });
    // Draft and configuration updates reuse the current path's turn state; rederive it only when the history position changes.
    const turns = new Map<string, { nodeId: string | null; interruptions: readonly (string | null)[]; state: AgentTurnState }>();
    return {
      events: [AgentSoftwareFeedback],
      tools: [createPeekTool(plugin.models, application.userAgent, usage), createSendTool(), createWaitTool(loop)],
      resources: [implementResource(Agent, AgentView, {
        card: agentCard,
        template: { current: [AgentSelection] },
        records: [AgentInputMessage, Execution, ContextSummary],
        attach(_data, object, lifetime) {
          lifetime.defer(() => { feedback.delete(object.ref.id); turns.delete(object.ref.id); });
        },
        links: { receive: true, tools: object => selection.tools(selection.agent(selectionOf(object).selection)) },
        creation: implementCreation(CreateAgent, {
          prepare(input) { selection.validate(input.selection); return { action: "accept" }; },
          create(input, object) {
            object.commit(writer => { writer.set(AgentSelection, { selection: input.selection }); });
            return { title: input.title ?? generateAgentName(), data: {} };
          },
        }),
        project(_data, object) {
          const value = object.get(AgentSelection);
          const drafts = object.get(AgentDrafts) ?? [];
          const transient = feedback.get(object);
          if (loop.running(object))
            return { agentId: object.ref.id, selection: value?.selection ?? null, executionState: "running" as const, drafts,
              feedback: [...transient.inline], compressions: [...transient.compressions] };
          const history = object.session.snapshot();
          let turn = turns.get(object.ref.id);
          if (!turn || turn.nodeId !== history.position.nodeId || turn.interruptions !== transient.interruptions) {
            turn = { nodeId: history.position.nodeId, interruptions: transient.interruptions,
              state: projectAgentTurnState(history, object.ref.id, transient.interruptions) };
            turns.set(object.ref.id, turn);
          }
          return { agentId: object.ref.id, selection: value?.selection ?? null,
            executionState: agentExecutionState(turn.state, false), drafts,
            feedback: [...transient.inline], compressions: [...transient.compressions] };
        },
        async inspect(_data, object) {
          return { type: Agent.kind, title: object.snapshot()?.title ?? "Agent" };
        },
        actions: [
          implementAction(SaveAgentDraft, { async execute(input, object) { saveDraft(object, input); } }),
          implementAction(SetAgentDraftMode, { async execute(input, object) { setDraftMode(object, input); } }),
          implementAction(ExchangeAgentDraft, { async execute(input, object) { exchangeDraft(object, input); } }),
          implementAction(DiscardAgentDraft, { async execute(input, object) { discardDraft(object, input); } }),
          implementAction(MoveAgentDraft, { async execute(input, object) { moveDraft(object, input); } }),
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
