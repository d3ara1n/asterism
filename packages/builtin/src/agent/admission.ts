import { AgentSelection, AgentDrafts } from "./data.ts";
import { PluginApiError, type ModelServices, type ObjectReader, type ObjectExecutor, type ObjectInitializer, type ObjectWriter, type ContentReader } from "@asterism-app/sdk/runtime";
import { type SubmitAgentInputData, type AgentSelection as Selection, AgentInputMessage, type AgentConfiguration } from "@asterism-app/builtin-api/contracts";
import { selectionOf, type AgentSelectionService } from "./selection.ts";
import type { SystemPrompt } from "@asterism-app/sdk/contracts";
import { projectForAgent } from "./projection.ts";
import { duplicateSubmission, rememberSubmission } from "./submissions.ts";
import { projectInputMessage } from "./input-message.ts";

function writeInput(input: SubmitAgentInputData, object: ObjectReader, writer: ObjectWriter, queued: boolean) {
  if (queued) writer.set(AgentDrafts, [...object.get(AgentDrafts) ?? [], {
    id: input.submissionId, mode: input.mode, parts: input.parts, sender: input.sender,
  }]);
  else writer.append(AgentInputMessage, { parts: input.parts, startsTurn: true, sender: input.sender });
  rememberSubmission(object, writer, input);
}

/** Resource actions accept inputs independently and share model preflight checks; submission identity and persistence form one atomic acceptance. */
export function createAdmission(deps: { selection: AgentSelectionService; validate: ModelServices["validate"]; running(object: ObjectReader): boolean; systemPrompt: (agent: Pick<AgentConfiguration, "id" | "systemPrompt">) => SystemPrompt }) {
  const idle = (object: ObjectReader) => {
    if (deps.running(object)) throw new PluginApiError("conflict", "This agent is running. Cancel or wait for it to finish.");
  };
  const ready = (object: ObjectReader) => {
    if (!object.snapshot()) throw new PluginApiError("not_found", "The agent is not on the continuation path.");
    selectionOf(object);
  };
  const validate = async (object: ObjectReader, signal: AbortSignal, content: ContentReader, input?: SubmitAgentInputData) => {
    const current = object.get(AgentSelection);
    if (!current) return;
    const agent = deps.selection.agent(current.selection), snapshot = object.session.snapshot();
    const messages = projectForAgent(snapshot, object.ref.id);
    if (input) messages.push(projectInputMessage(input));
    await deps.validate({ target: deps.selection.target(current.selection), system: deps.systemPrompt(agent), messages, signal }, { content });
  };
  return {
    async prepareInitial(input: SubmitAgentInputData, selection: Selection, signal: AbortSignal, content: ContentReader) {
      const agent = deps.selection.agent(selection);
      await deps.validate({ target: deps.selection.target(selection), system: deps.systemPrompt(agent), messages: [projectInputMessage(input)], signal }, { content });
    },
    acceptInitial(input: SubmitAgentInputData, object: ObjectInitializer) {
      object.commit(writer => { writeInput(input, object, writer, false); });
    },
    async prepareSubmit(input: SubmitAgentInputData, object: ObjectReader, signal: AbortSignal, content: ContentReader): Promise<void> {
      if (duplicateSubmission(object, input)) return;
      // Inputs received during execution are accepted into the draft box only; the model target and full context are revalidated at the actual request boundary.
      if (deps.running(object)) return;
      await validate(object, signal, content, input);
    },
    submit(input: SubmitAgentInputData, object: ObjectExecutor): boolean {
      if (duplicateSubmission(object, input)) return false;
      const queued = deps.running(object);
      object.commit(writer => {
        ready(object);
        writeInput(input, object, writer, queued);
      });
      return !queued;
    },
    async prepareResume(object: ObjectReader, signal: AbortSignal, content: ContentReader): Promise<void> {
      idle(object);
      await validate(object, signal, content);
    },
    resume(object: ObjectReader): void {
      idle(object);
      ready(object);
    },
  };
}
