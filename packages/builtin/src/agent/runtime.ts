import { agentCard } from "../shared/card-appearance.ts";
import { createRequestAssembly } from "./preparation.ts";
import type { ApplicationIdentity } from "@asterism-app/sdk/runtime";
import { AgentView, AgentSelection, AgentDrafts } from "./data.ts";
import { defineModule, implementResource, implementCreation, implementAction, implementCall, PluginApiError, type ResourceRef } from "@asterism-app/sdk/runtime";
import { registerAgentServices } from "@asterism-app/builtin-api/runtime";
import {
  Agent, CreateAgent, SubmitAgentInput, ContinueAgent, ConfigureAgent, CancelAgent, StartAgentSession, inputSummary,
  AgentInputMessage, Execution, ContextSummary,
} from "@asterism-app/builtin-api/contracts";
import { createSelection, selectionOf } from "./selection.ts";
import { generateAgentName } from "./name.ts";
import { createAgentController } from "./controller.ts";
import { createAdmission } from "./admission.ts";
import { projectAgentTurnState } from "./state-projection.ts";
import { agentExecutionState } from "./state.ts";
import type { AgentTurnState } from "./state.ts";
import type { ProviderUsage } from "@asterism-app/sdk/runtime";
import { createPeekTool, investigateAgent } from "./peek/runtime.ts";
import { AgentSoftwareFeedback } from "./feedback.ts";
import { createAgentFeedback } from "./feedback-state.ts";
import { SaveAgentDraft, SetAgentDraftMode, ExchangeAgentDraft, DiscardAgentDraft, MoveAgentDraft } from "./drafts-contract.ts";
import { saveDraft, setDraftMode, exchangeDraft, discardDraft, moveDraft } from "./drafts.ts";
import { createSendTool } from "./send/runtime.ts";
import { createWaitTool } from "./wait/runtime.ts";
import type { SkillCatalog } from "../skills/catalog.ts";
import { builtinConfiguration, resolveRoleTarget } from "../configuration/runtime.ts";

/** The resource entry point only assembles domain modules and contributions; business modules do not depend on the full plugin context. */
export function createAgentModule(application: ApplicationIdentity, usage: ProviderUsage, skills: SkillCatalog) {
  return defineModule(plugin => {
    const prepareRequest = createRequestAssembly(plugin, skills);
    const systemPrompt = (agent: Parameters<typeof prepareRequest>[0]) => prepareRequest(agent)().system;
    const selection = createSelection({ agents: () => builtinConfiguration(plugin).agents, roles: () => builtinConfiguration(plugin).roles });
    const peek = { models: plugin.models, userAgent: application.userAgent, usage,
      utility: () => resolveRoleTarget(builtinConfiguration(plugin).roles, "utility") };
    const feedback = createAgentFeedback();
    plugin.lifetime.defer(feedback.clear);
    const controller = createAgentController({ selection, tasks: plugin.tasks, models: plugin.models, execution: plugin.execution, prepareRequest, userAgent: application.userAgent,
      usage, feedback });
    const admission = createAdmission({ selection, validate: plugin.models.validate, running: controller.running, systemPrompt });
    const agentObject = (ref: ResourceRef) => {
      if (ref.kind !== Agent.kind) throw new PluginApiError("invalid_argument", "The target is not an Agent.");
      const object = plugin.object(ref.sessionId, Agent, ref.id);
      if (!object.snapshot()) throw new PluginApiError("not_found", "The Agent is unavailable on its current session path.");
      return object;
    };
    registerAgentServices(plugin, {
      describe: ref => ({ type: selectionOf(agentObject(ref)).selection.agent }),
      peek: (ref, args, signal, publish) => investigateAgent(peek, agentObject(ref), args, signal, publish),
    });
    // Draft and configuration updates reuse the current path's turn state; rederive it only when the history position changes.
    const turns = new Map<string, { nodeId: string | null; interruptions: readonly (string | null)[]; state: AgentTurnState }>();
    return {
      calls: [implementCall(StartAgentSession, async (input, context) => {
        let accepted: ResourceRef | undefined;
        const submission = { submissionId: input.submissionId, parts: input.parts, mode: "follow" as const, sender: { kind: "user" as const } };
        const sessionId = await plugin.createSession(`home:${input.submissionId}`, async preparation => {
          const prepared = await preparation.prepare(CreateAgent, { selection: input.selection });
          const acceptedInput = await preparation.prepareAction(prepared, SubmitAgentInput, submission);
          await admission.prepareInitial(acceptedInput, input.selection, preparation.signal, context.content);
          return { title: inputSummary(acceptedInput.parts).slice(0, 72), initialize(session) {
            const resource = session.create(prepared);
            admission.acceptInitial(acceptedInput, session.object(Agent, resource.id));
            accepted = resource;
          } };
        }, { signal: context.signal, content: context.content });
        if (accepted) controller.start(plugin.object(sessionId, Agent, accepted.id));
        return { sessionId };
      })],
      events: [AgentSoftwareFeedback],
      tools: [createPeekTool(peek), createSendTool(), createWaitTool(controller)],
      resources: [implementResource(Agent, AgentView, {
        card: agentCard,
        template: { current: [AgentSelection], createTitle: generateAgentName },
        records: [AgentInputMessage, Execution, ContextSummary],
        attach(_data, object, lifetime) {
          lifetime.defer(() => { feedback.delete(object.ref.id); turns.delete(object.ref.id); });
        },
        links: { receive: true },
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
          if (controller.running(object))
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
            async execute(input, object) { if (admission.submit(input, object)) controller.start(object); },
          }),
          implementAction(ContinueAgent, {
            async prepare(_input, { object, signal, content }) { await admission.prepareResume(object, signal, content); return { action: "accept" }; },
            async execute(_input, object) { admission.resume(object); controller.start(object); },
          }),
          implementAction(ConfigureAgent, { async execute(input, object) {
            object.commit(writer => {
              const current = selectionOf(object);
              selection.validate(input.selection, current.selection);
              writer.set(AgentSelection, { selection: input.selection });
            });
          } }),
          implementAction(CancelAgent, { async execute(_input, object) { controller.cancel(object); } }),
        ],
      })],
    };
  });
}
