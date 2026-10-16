import { defineModule, defineTopLevelTool, implementCall, PluginApiError } from "@atelier/sdk/runtime";
import { Agent } from "@atelier/builtin-api/contracts";
import { AnswerQuestion, AskUserResult, CancelQuestion, QuestionsChanged, ReadQuestions, askUserArgs } from "./contract.ts";
import { createQuestionService } from "./service.ts";

export default defineModule(plugin => {
  const questions = createQuestionService((object, version, pendingIds) => {
    try { plugin.ipc.events.publish(QuestionsChanged, { sessionId: object.sessionId, agentId: object.id, version, pendingIds }); }
    catch (error) {
      // 宿主关闭先结束事件路由，再取消运行；此时只收束后台等待。
      if (!(error instanceof PluginApiError && error.code === "unavailable")) throw error;
    }
  });
  return {
    events: [QuestionsChanged],
    topLevelTools: [defineTopLevelTool({
      id: AskUserResult.id, name: "ask_user",
      description: "Ask the user to make a decision or supply missing information. Waits until the user answers or cancels.",
      guidelines: [
        "Use only for decisions or missing information that materially affect the work and require the user.",
        "Combine independent questions in one call. Ask questions that depend on earlier answers in a later call.",
        "Use the user's language. Usually offer 2–5 distinct options with concise tradeoffs; use text questions for open-ended input.",
        "An editable custom option is always available for choice questions; an overall note is available for corrections and constraints. Do not add Other options or prefill user answers.",
        "Recommendations must explain why and never count as user selections.",
        "Read all qualifications and overall corrections together with selections. A skipped or cancelled question is not consent.",
        "Questions have no response deadline. Cancelling a question does not by itself stop the Agent.",
      ],
      argsSchema: askUserArgs, resultSchema: AskUserResult.schema, effect: "read", execution: "parallel",
      execute(args, { object, callId, signal, publish }) {
        if (object.ref.kind !== Agent.kind) return Promise.resolve({
          kind: "rejected", error: { code: "unsupported_object", message: "ask_user requires a built-in Agent." },
        });
        return questions.ask(object.ref, callId, args.questions, signal, requestId => publish({ requestId }));
      },
    })],
    calls: [
      implementCall(ReadQuestions, async (_input, { object }) => questions.read(object.ref)),
      implementCall(AnswerQuestion, async (input, { object }) => { questions.answer(object.ref, input.id, input.submission); return null; }),
      implementCall(CancelQuestion, async (input, { object }) => { questions.cancel(object.ref, input.id); return null; }),
    ],
  };
});
