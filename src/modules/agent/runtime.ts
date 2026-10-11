import { defineModule, implementResource, PluginApiError, type PluginContext, type ObjectContext } from "@atelier/sdk/runtime";
import type { ModelTarget } from "@atelier/sdk/contracts";
import type { AgentSelection as Selection } from "../../shared/model.ts";
import { Agent, AgentView, AgentSelection, AgentSubmissions, agentCommandSchema, agentCreateSchema } from "./contract.ts";
import { AgentConfigurations } from "./configuration.ts";
import { UserMessage, Execution, Notice } from "./records.ts";
import { composeSystemPrompt } from "./system-prompt.ts";
import { projectForAgent } from "./projection.ts";

function configurations(plugin: PluginContext) { return plugin.catalogs.get(AgentConfigurations)?.filter(agent => agent.enabled) ?? []; }
function agentOf(plugin: PluginContext, selection: Selection) {
  const agent = configurations(plugin).find(value => value.id === selection.agent);
  if (!agent) throw new PluginApiError("unavailable", "Agent configuration is unavailable. Choose an available agent.");
  return agent;
}
/** 已失效的另一项可暂时保留以便逐项修复；执行前仍完整校验。 */
function normalizeSelection(plugin: PluginContext, selection: Selection, previous?: Selection): Selection {
  if (!configurations(plugin).some(agent => agent.id === selection.agent) && selection.agent !== previous?.agent)
    throw new PluginApiError("unavailable", "The selected agent configuration is unavailable.");
  const model = plugin.models.list().find(value => value.model === selection.model);
  if (!model) {
    if (selection.model !== previous?.model) throw new PluginApiError("unavailable", "The selected model is unavailable.");
    return selection;
  }
  return model.capabilities.reasoning ? selection : { ...selection, thinking: "off" };
}
function targetOf(plugin: PluginContext, selection: Selection): ModelTarget {
  return { role: agentOf(plugin, selection).modelRole ?? "default", model: selection.model, thinking: selection.thinking ?? undefined };
}
function selectionOf(object: ObjectContext) {
  const value = object.get(AgentSelection);
  if (!value) throw new PluginApiError("not_found", "Agent not found.");
  return value;
}
function duplicate(object: ObjectContext, command: { submissionId: string }): boolean {
  const prior = object.get(AgentSubmissions)?.[command.submissionId];
  if (prior === undefined) return false;
  if (prior !== JSON.stringify(command)) throw new PluginApiError("conflict", "This submission ID was already used for different input.");
  return true;
}
const taskKey = (object: ObjectContext) => `agent:${object.ref.id}`;

export default defineModule(plugin => {
  const launch = (object: ObjectContext) => {
    const initial = agentOf(plugin, selectionOf(object).selection);
    const started = plugin.tasks.start(taskKey(object), async signal => {
      try {
        for (let request = 0; ; request++) {
          signal.throwIfAborted();
          const selection = selectionOf(object).selection, agent = agentOf(plugin, selection);
          if (request >= (agent.maxTurns ?? 32)) {
            object.commit(writer => { writer.append(Notice, { level: "error", code: "request_limit",
              message: "The agent reached the model request limit. Continue explicitly to resume." }); });
            return;
          }
          const snapshot = object.session.snapshot();
          const result = await plugin.models.run({ object: object.ref, requestParentId: snapshot.position.nodeId,
            target: targetOf(plugin, selection), system: composeSystemPrompt(agent), messages: projectForAgent(snapshot, object.ref.id), signal,
            tools: { ...(agent.tools === null ? {} : { allow: agent.tools }), ...(agent.excludeTools === null ? {} : { exclude: agent.excludeTools }) },
            cache: { expectHit: request > 0 }, observer: { event(event) {
              if (event.type !== "progress") object.commit(writer => { writer.append(Execution, event); });
            } },
          });
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
  };
  return {
    resources: [implementResource(Agent, AgentView, {
      records: [UserMessage, Execution, Notice],
      links: { receive: true, tools(object) {
        const agent = agentOf(plugin, selectionOf(object).selection);
        return { ...(agent.tools === null ? {} : { allow: agent.tools }), ...(agent.excludeTools === null ? {} : { exclude: agent.excludeTools }) };
      } },
      creation: {
        schema: agentCreateSchema,
        async prepare({ selection, title }) { return { selection: normalizeSelection(plugin, selection), ...(title ? { title } : {}) }; },
        create({ selection, title }, object) {
          object.commit(writer => { writer.set(AgentSelection, { selection, revision: 1 }); });
          return { title: title ?? agentOf(plugin, selection).name, data: {} };
        },
      },
      project(_data, object) {
        const value = object.get(AgentSelection);
        return { agentId: object.ref.id, selection: value?.selection ?? null, selectionRevision: value?.revision ?? 0 };
      },
      async inspect(_data, object) {
        const current = object.session.snapshot().resources.get(Agent, object.ref.id);
        return { type: Agent.kind, title: current?.resource.title ?? "Agent" };
      },
      actions: {
        schema: agentCommandSchema,
        async prepare(command, object, signal) {
          if (command.type === "cancel" || command.type === "configure") return { action: "accept" };
          if (command.type === "submit" && duplicate(object, command)) return { action: "accept" };
          if (plugin.tasks.has(taskKey(object))) throw new PluginApiError("conflict", "This agent is running. Cancel or wait for it to finish.");
          const current = object.get(AgentSelection);
          if (current) {
            const agent = agentOf(plugin, current.selection);
            const snapshot = object.session.snapshot();
            const messages = projectForAgent(snapshot, object.ref.id, snapshot.position.continuationId);
            if (command.type === "submit") messages.push({ kind: "input", text: command.text });
            await plugin.models.validate({ target: targetOf(plugin, current.selection), system: composeSystemPrompt(agent), messages, signal });
          }
          return { action: "accept" };
        },
        async execute(command, object) {
          if (command.type === "cancel") { plugin.tasks.cancel(taskKey(object)); return; }
          if (command.type === "configure") {
            object.commit(writer => {
              const current = selectionOf(object);
              writer.set(AgentSelection, { selection: normalizeSelection(plugin, command.selection, current.selection), revision: current.revision + 1 });
            });
            return;
          }
          if (command.type === "submit" && duplicate(object, command)) return;
          if (plugin.tasks.has(taskKey(object))) throw new PluginApiError("conflict", "This agent is running. Cancel or wait for it to finish.");
          object.commit(writer => {
            object.session.resume();
            if (!object.snapshot()) throw new PluginApiError("not_found", "The agent is not on the continuation path.");
            selectionOf(object);
            if (command.type === "submit") {
              writer.append(UserMessage, { agentId: object.ref.id, text: command.text });
              writer.set(AgentSubmissions, { ...object.get(AgentSubmissions) ?? {}, [command.submissionId]: JSON.stringify(command) });
            }
          });
          launch(object);
        },
      },
    })],
  };
});
