import { defineModule, defineTopLevelTool, implementCall, PluginApiError } from "@atelier/sdk/runtime";
import { Agent } from "@atelier/builtin-api/contracts";
import { AnswerQuestion, AskUserResult, CancelQuestion, QuestionsChanged, ReadQuestions, askUserArgs } from "./contract.ts";
import { createQuestionService } from "./service.ts";

export default defineModule(plugin => {
  const questions = createQuestionService((object, version) => {
    try { plugin.ipc.events.publish(QuestionsChanged, { sessionId: object.sessionId, agentId: object.id, version }); }
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
      guidelines: ["Use for decisions or missing information that require the user.", "There is no response deadline."],
      argsSchema: askUserArgs, resultSchema: AskUserResult.schema, effect: "read", execution: "parallel",
      execute(args, { object, callId, signal }) {
        if (object.ref.kind !== Agent.kind) return Promise.resolve({
          kind: "rejected", error: { code: "unsupported_object", message: "ask_user requires a built-in Agent." },
        });
        return questions.ask(object.ref, callId, args.question, signal);
      },
    })],
    calls: [
      implementCall(ReadQuestions, async (_input, { object }) => questions.read(object.ref)),
      implementCall(AnswerQuestion, async (input, { object }) => { questions.answer(object.ref, input.id, input.answer); return null; }),
      implementCall(CancelQuestion, async (input, { object }) => { questions.cancel(object.ref, input.id); return null; }),
    ],
  };
});
