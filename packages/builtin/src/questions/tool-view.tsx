import { MessageCircleQuestion } from "lucide-react";
import type { Json } from "@asterism/sdk/contracts";
import { toolRenderer, useI18n, type ToolExecutionRenderProps, type ToolResultRenderProps } from "@asterism/sdk/renderer";
import { StatusText } from "@asterism/ui/ui/status";
import { ToolHeader } from "@asterism/ui/tool-header";
import { questionMessages as messages } from "../messages/questions";
import { AnswerSummary } from "./answer-summary";
import { askUserArgs, AskUserResult, type Answer, type Question } from "./contract";
import { QuestionPanel } from "./panel";
import { questionTitles } from "./preview";
import { resultRows } from "./summary";

type ExecutionProps = ToolExecutionRenderProps<Answer>;
type ResultProps = ToolResultRenderProps<Answer>;

/** 历史参数可能来自旧版契约；无法解析时只展示保存的答案与题目文字。 */
function parseQuestions(args: Json): Question[] | null {
  const parsed = askUserArgs.safeParse(args);
  return parsed.success ? parsed.data.questions : null;
}
/** 执行中已发布等待实例身份即可作答。 */
function waitingRequest(props: ExecutionProps): string | null {
  const data = props.result?.data;
  return props.phase === "executing" && data && "requestId" in data ? data.requestId : null;
}

function ExecutionHeader({ phase, args }: ExecutionProps) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.navigation)} subject={questionTitles(args)[0]}
    meta={i18n.text(phase === "ready" ? messages.queued : messages.waiting)} />;
}
function ResultHeader({ args, result }: ResultProps) {
  const i18n = useI18n();
  const data = result.data;
  const meta = data && "answers" in data
    ? i18n.formatMessage(messages.answeredCount, { done: data.answers.filter(answer => answer.status === "answered").length, total: data.answers.length })
    : undefined;
  return <ToolHeader label={i18n.text(messages.navigation)} subject={questionTitles(args)[0]} meta={meta} />;
}

function Titles({ args }: { args: Json }) {
  return <div className="space-y-2">
    {questionTitles(args).map((title, index) => <p key={index} className="type-body whitespace-pre-wrap break-words">{title}</p>)}
  </div>;
}
function ExecutionBody(props: ExecutionProps) {
  const requestId = waitingRequest(props);
  const questions = parseQuestions(props.args);
  if (requestId && questions) return <QuestionPanel requestId={requestId} questions={questions} />;
  return <Titles args={props.args} />;
}
function ResultBody({ args, result }: ResultProps) {
  const i18n = useI18n();
  const data = result.data;
  if (data && "answers" in data) return <AnswerSummary rows={resultRows(parseQuestions(args), data)} message={data.message} />;
  if (data && "answer" in data) {
    const title = questionTitles(args)[0];
    return <div className="space-y-1 type-body whitespace-pre-wrap break-words">
      {title && <p className="type-label">{title}</p>}<p>{data.answer}</p>
    </div>;
  }
  return <div className="space-y-3">
    <Titles args={args} />
    <StatusText tone="neutral">{i18n.text(result.kind === "cancelled" ? messages.cancelled : messages.unanswered)}</StatusText>
  </div>;
}

/** 参数填充使用默认视图；执行中的正文即作答界面，提交后原位变为只读回执。 */
export const questionToolRenderer = toolRenderer(AskUserResult, {
  label: messages.navigation, icon: <MessageCircleQuestion className="size-3.5" />,
  execution: { headerRenderer: ExecutionHeader, bodyRenderer: ExecutionBody, attention: props => waitingRequest(props) !== null },
  result: { headerRenderer: ResultHeader, bodyRenderer: ResultBody },
});
