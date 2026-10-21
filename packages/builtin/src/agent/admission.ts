import { AgentSelection, AgentDrafts } from "./data.ts";
import { PluginApiError, type ModelServices, type ObjectReader, type ObjectExecutor, type ContentReader } from "@atelier/sdk/runtime";
import { SubmitAgentInput, type SubmitAgentInputData, AgentInputMessage } from "@atelier/builtin-api/contracts";
import { selectionOf, type AgentSelectionService } from "./selection.ts";
import type { composeSystemPrompt } from "./system-prompt.ts";
import { projectForAgent } from "./projection.ts";
import { duplicateSubmission, rememberSubmission } from "./submissions.ts";
import { projectInputMessage } from "./input-message.ts";

/** 资源动作各自受理，共用模型预检；提交身份和落库构成一次原子受理。 */
export function createAdmission(deps: { selection: AgentSelectionService; validate: ModelServices["validate"]; running(object: ObjectReader): boolean; systemPrompt: (agent: Parameters<typeof composeSystemPrompt>[0]) => ReturnType<typeof composeSystemPrompt> }) {
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
    async prepareSubmit(input: SubmitAgentInputData, object: ObjectReader, signal: AbortSignal, content: ContentReader): Promise<void> {
      if (duplicateSubmission(object, SubmitAgentInput, input)) return;
      // 在途输入只受理到草稿箱；模型目标和完整上下文在实际请求边界重新校验。
      if (deps.running(object)) return;
      await validate(object, signal, content, input);
    },
    submit(input: SubmitAgentInputData, object: ObjectExecutor): boolean {
      if (duplicateSubmission(object, SubmitAgentInput, input)) return false;
      const queued = deps.running(object);
      object.commit(writer => {
        ready(object);
        if (queued) writer.set(AgentDrafts, [...object.get(AgentDrafts) ?? [], {
          id: input.submissionId, revision: 0, mode: input.mode, parts: input.parts, sender: input.sender,
        }]);
        else writer.append(AgentInputMessage, { parts: input.parts, startsTurn: true, sender: input.sender });
        rememberSubmission(object, writer, SubmitAgentInput, input);
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
