import { AgentSelection, AgentSubmissions } from "./data.ts";
import { PluginApiError, type ModelServices, type ObjectReader, type ObjectExecutor, type ContentReader } from "@atelier/sdk/runtime";
import { type AgentCommand, UserMessage } from "@atelier/builtin-api/contracts";
import { selectionOf, type AgentSelectionService } from "./selection.ts";
import type { composeSystemPrompt } from "./system-prompt.ts";
import { projectForAgent } from "./projection.ts";

type Input = Extract<AgentCommand, { type: "submit" | "continue" }>;
function duplicate(object: ObjectReader, command: Input): boolean {
  if (command.type !== "submit") return false;
  const prior = object.get(AgentSubmissions)?.[command.submissionId];
  if (prior === undefined) return false;
  if (prior !== JSON.stringify(command)) throw new PluginApiError("conflict", "This submission ID was already used for different input.");
  return true;
}
/** 去重、续接与记录写入构成一次受理；调用方只消费是否需要启动执行。 */
export function createAdmission(deps: { selection: AgentSelectionService; validate: ModelServices["validate"]; running(object: ObjectReader): boolean; systemPrompt: (agent: Parameters<typeof composeSystemPrompt>[0]) => ReturnType<typeof composeSystemPrompt> }) {
  const idle = (object: ObjectReader) => {
    if (deps.running(object)) throw new PluginApiError("conflict", "This agent is running. Cancel or wait for it to finish.");
  };
  return {
    async prepare(command: Input, object: ObjectReader, signal: AbortSignal, content: ContentReader): Promise<void> {
      if (duplicate(object, command)) return;
      idle(object);
      const current = object.get(AgentSelection);
      if (current) {
        const agent = deps.selection.agent(current.selection), snapshot = object.session.snapshot();
        const messages = projectForAgent(snapshot, object.ref.id);
        if (command.type === "submit") messages.push({ kind: "input", parts: command.parts });
        await deps.validate({ target: deps.selection.target(current.selection), system: deps.systemPrompt(agent), messages, signal }, { content });
      }
    },
    accept(command: Input, object: ObjectExecutor): boolean {
      if (duplicate(object, command)) return false;
      idle(object);
      object.commit(writer => {
        if (!object.snapshot()) throw new PluginApiError("not_found", "The agent is not on the continuation path.");
        selectionOf(object);
        if (command.type === "submit") {
          writer.append(UserMessage, { parts: command.parts });
          writer.set(AgentSubmissions, { ...object.get(AgentSubmissions) ?? {}, [command.submissionId]: JSON.stringify(command) });
        }
      });
      return true;
    },
  };
}
