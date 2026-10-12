import { defineModule, implementResource, implementCreation, implementAction } from "@atelier/sdk/runtime";
import { Agent, AgentView, AgentSelection, CreateAgent, SubmitAgentInput, ContinueAgent, ConfigureAgent, CancelAgent } from "./contract.ts";
import { AgentConfigurations } from "./configuration.ts";
import { UserMessage, Execution, Notice } from "./records.ts";
import { createSelection, selectionOf } from "./selection.ts";
import { createAgentLoop } from "./loop.ts";
import { createAdmission } from "./admission.ts";

/** 资源入口只装配领域模块与贡献；业务模块不依赖完整插件上下文。 */
export default defineModule(plugin => {
  const selection = createSelection({ agents: () => plugin.catalogs.get(AgentConfigurations) ?? [], models: plugin.models.list });
  const loop = createAgentLoop({ selection, tasks: plugin.tasks, run: plugin.models.run });
  const admission = createAdmission({ selection, validate: plugin.models.validate, running: loop.running });
  return {
    resources: [implementResource(Agent, AgentView, {
      records: [UserMessage, Execution, Notice],
      links: { receive: true, tools: object => selection.tools(selection.agent(selectionOf(object).selection)) },
      creation: implementCreation(CreateAgent, {
        prepare(input) { return { action: "replace", input: { ...input, selection: selection.normalize(input.selection) } }; },
        create(input, object) {
          object.commit(writer => { writer.set(AgentSelection, { selection: input.selection, revision: 1 }); });
          return { title: input.title ?? selection.agent(input.selection).name, data: {} };
        },
      }),
      project(_data, object) {
        const value = object.get(AgentSelection);
        return { agentId: object.ref.id, selection: value?.selection ?? null, selectionRevision: value?.revision ?? 0 };
      },
      async inspect(_data, object) {
        return { type: Agent.kind, title: object.snapshot()?.title ?? "Agent" };
      },
      actions: [
        implementAction(SubmitAgentInput, {
          async prepare(input, { object, signal }) { await admission.prepare(input, object, signal); return { action: "accept" }; },
          async execute(input, object) { if (admission.accept(input, object)) loop.start(object); },
        }),
        implementAction(ContinueAgent, {
          async prepare(input, { object, signal }) { await admission.prepare(input, object, signal); return { action: "accept" }; },
          async execute(input, object) { if (admission.accept(input, object)) loop.start(object); },
        }),
        implementAction(ConfigureAgent, { async execute(input, object) {
          object.commit(writer => {
            const current = selectionOf(object);
            writer.set(AgentSelection, { selection: selection.normalize(input.selection, current.selection), revision: current.revision + 1 });
          });
        } }),
        implementAction(CancelAgent, { async execute(_input, object) { loop.cancel(object); } }),
      ],
    })],
  };
});
