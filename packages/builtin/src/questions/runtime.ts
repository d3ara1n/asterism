import { defineModule, defineTopLevelTool, implementCall, PluginApiError } from "@atelier/sdk/runtime";
import { Agent } from "@atelier/builtin-api/contracts";
import { AnswerQuestion, AskUserResult, CancelQuestion, QuestionsChanged, ReadQuestions, askUserArgs } from "./contract.ts";
import { createQuestionService } from "./service.ts";

export default defineModule(plugin => {
  const questions = createQuestionService((object, pending) => {
    try { plugin.ipc.events.publish(QuestionsChanged, { sessionId: object.sessionId, agentId: object.id, pending }); }
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
        "One call presents a group of single-choice, multiple-choice, or text questions.",
        "Choice questions include an editable custom option. The user can add an overall note with corrections and constraints.",
        "Recommendations contain an option ID and a reason. User selections are recorded in the returned answers.",
        "The result includes each question's answered or skipped state and the user's overall note.",
        "The tool waits until the user answers, cancels, or execution ends.",
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
      implementCall(ReadQuestions, async (_input, { object }) => {
        questions.publish(object.ref);
        return questions.read(object.ref);
      }),
      implementCall(AnswerQuestion, async (input, { object }) => { questions.answer(object.ref, input.id, input.submission); return null; }),
      implementCall(CancelQuestion, async (input, { object }) => { questions.cancel(object.ref, input.id); return null; }),
    ],
  };
});
