import { ArrowDownToLine, MessageCircleQuestion } from "lucide-react";
import { toolRenderer, useI18n, useRendererObject, type ToolRenderProps } from "@atelier/sdk/renderer";
import type { Json } from "@atelier/sdk/contracts";
import { Button } from "@atelier/ui/ui/button";
import { StatusText } from "@atelier/ui/ui/status";
import { ToolHeader } from "@atelier/ui/tool-header";
import { questionMessages as messages } from "../messages/questions";
import { AskUserResult, type Answer } from "./contract";
import { questionFocus } from "./focus";

/** 部分参数没有通过 schema；只消费已出现的字符串，不将填充视图当作待回答表单。 */
function questionTitles(args: Json): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  if (typeof args.question === "string") return [args.question];
  if (!Array.isArray(args.questions)) return [];
  return args.questions.flatMap(question => question && typeof question === "object" && !Array.isArray(question)
    && typeof question.question === "string" ? [question.question] : []);
}
function Header({ phase, args, result }: ToolRenderProps<Answer>) {
  const i18n = useI18n();
  const titles = questionTitles(args);
  const data = result?.data;
  const summary = data && "answers" in data
    ? i18n.formatMessage(messages.progress, { done: data.answers.filter(answer => answer.status === "answered").length, total: data.answers.length })
    : phase === "input" ? i18n.text(messages.preparing)
      : phase === "ready" ? i18n.text(messages.queued)
        : phase === "executing" ? i18n.text(messages.waiting) : undefined;
  return <ToolHeader label={i18n.text(messages.navigation)} subject={titles[0]} meta={summary} />;
}
function Body({ args, phase, result }: ToolRenderProps<Answer>) {
  const i18n = useI18n();
  const { ref } = useRendererObject();
  const titles = questionTitles(args);
  const data = result?.data;
  if (data && "answers" in data) return <div className="space-y-4">
    {data.answers.map(answer => <div key={answer.id} className="space-y-1 type-body whitespace-pre-wrap break-words">
      <p className="type-label">{answer.question}</p>
      {answer.status === "skipped" ? <StatusText tone="neutral">{i18n.text(messages.skipped)}</StatusText> : <>
        {answer.selected.map(option => <p key={option.id}>{option.label}</p>)}
        {answer.text && <p>{answer.text}</p>}
        {answer.comment && <p className="text-muted-foreground">{answer.comment}</p>}
      </>}
    </div>)}
    {data.message && <div className="space-y-1 type-body whitespace-pre-wrap break-words">
      <p className="type-label">{i18n.text(messages.message)}</p><p>{data.message}</p>
    </div>}
  </div>;
  if (data && "answer" in data) return <div className="space-y-1 type-body whitespace-pre-wrap break-words">
    {titles[0] && <p className="type-label">{titles[0]}</p>}<p>{data.answer}</p>
  </div>;
  return <div className="space-y-3">
    {titles.map((title, index) => <p key={index} className="type-body whitespace-pre-wrap break-words">{title}</p>)}
    {phase === "executing" && data && "requestId" in data && <Button type="button" size="sm" variant="outline" onClick={() => questionFocus.open(ref, data.requestId)}>
      <ArrowDownToLine />{i18n.text(messages.locate)}
    </Button>}
    {phase === "settled" && <StatusText tone="neutral">{i18n.text(result.kind === "cancelled" ? messages.cancelled : messages.unanswered)}</StatusText>}
  </div>;
}
export const questionToolRenderer = toolRenderer(AskUserResult, {
  label: messages.navigation, icon: <MessageCircleQuestion className="size-3.5" />,
  input: { headerRenderer: Header, bodyRenderer: Body },
  execution: { headerRenderer: Header, bodyRenderer: Body },
  result: { headerRenderer: Header, bodyRenderer: Body },
});
