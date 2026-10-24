import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Maximize2, MessageSquarePlus, Pencil, Send } from "lucide-react";
import { useI18n } from "@atelier/sdk/renderer";
import { AgentScrollArea } from "@atelier/builtin-api/renderer";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { Textarea } from "@atelier/ui/ui/textarea";
import { Field, FieldDescription, FieldLabel } from "@atelier/ui/ui/field";
import { StatusText } from "@atelier/ui/ui/status";
import { Spinner } from "@atelier/ui/ui/spinner";
import { Separator } from "@atelier/ui/ui/separator";
import { questionMessages as messages } from "../messages/questions";
import { answerIssue } from "./answers";
import { AnswerSummary } from "./answer-summary";
import type { Question, Submission } from "./contract";
import { draftSubmission, type QuestionDraft } from "./drafts";
import { QuestionFields } from "./question-fields";
import { submissionRows } from "./summary";

/** 内联时随对话流自然撑开；放大视图内使用局部滚动区。 */
export function QuestionForm({ questions, draft, update, answer, cancel, busy, failed, invalidId, setInvalidId, expanded, onEnlarge }: {
  questions: Question[]; draft: QuestionDraft; update(value: QuestionDraft): void;
  answer(value: Submission): void; cancel(): void; busy: boolean; failed: boolean;
  invalidId: string | null; setInvalidId(id: string | null): void; expanded: boolean; onEnlarge?(): void;
}) {
  const i18n = useI18n();
  const messageId = useId();
  const region = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const review = draft.page >= questions.length;
  const question = questions[draft.page];
  const submission = draftSubmission(questions, draft);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [draft.page]);
  const navigate = (page: number) => update({ ...draft, page });
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    if (questions.length > 1 && !review) { navigate(questions.length); return; }
    const invalid = questions.findIndex((question, index) => answerIssue(question, submission.answers[index]));
    if (invalid !== -1) {
      setInvalidId(questions[invalid]!.id); navigate(invalid);
      requestAnimationFrame(() => {
        const target = region.current?.querySelector<HTMLElement>('[aria-invalid="true"] button, button[aria-invalid="true"], textarea[aria-invalid="true"]');
        (target ?? region.current)?.focus({ preventScroll: true });
      });
      return;
    }
    setInvalidId(null);
    answer(submission);
  };
  const content: ReactNode = <div className="space-y-4">
    {question && <QuestionFields key={question.id} question={question} value={draft.answers[draft.page]!}
      update={value => { setInvalidId(null); update({ ...draft, answers: draft.answers.map((answer, index) => index === draft.page ? value : answer) }); }}
      invalid={invalidId === question.id} />}
    {review && <div className="space-y-3">
      <p className="type-section">{i18n.text(messages.review)}</p>
      <AnswerSummary rows={submissionRows(questions, submission)} action={index =>
        <Button type="button" size="xs" variant="ghost" onClick={() => navigate(index)}><Pencil />{i18n.text(messages.edit)}</Button>} />
    </div>}
    {(review || questions.length === 1) && (draft.messageOpen ? <Field>
      <FieldLabel htmlFor={messageId}>{i18n.text(messages.message)}</FieldLabel>
      <FieldDescription>{i18n.text(messages.messageHint)}</FieldDescription>
      <Textarea id={messageId} rows={2} value={draft.message} onChange={event => update({ ...draft, message: event.target.value })} />
    </Field> : <Button type="button" variant="ghost" size="sm" onClick={() => update({ ...draft, messageOpen: true })}>
      <MessageSquarePlus />{i18n.text(messages.message)}
    </Button>)}
  </div>;
  return <div ref={region} tabIndex={-1} className="min-h-0 outline-none" aria-label={i18n.text(messages.navigation)}>
    <form onSubmit={submit} onKeyDown={event => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
    }}>
      <fieldset disabled={busy} className="flex min-h-0 flex-col gap-3">
        {questions.length > 1 && <AgentScrollArea axis="horizontal"><nav className="flex gap-1" aria-label={i18n.text(messages.navigation)}>
          {questions.map((item, index) => {
            const status = submission.answers[index]?.status === "skipped" ? "skipped" : answerIssue(item, submission.answers[index]) ? "pending" : "answered";
            return <Button key={item.id} type="button" size="xs" variant={index === draft.page ? "selected" : "ghost"}
              className="max-w-40 shrink-0" aria-current={index === draft.page ? "step" : undefined} onClick={() => navigate(index)}
              title={`${item.question} · ${i18n.text(messages[status])}`}>
              <StatusText tone={status === "answered" ? "success" : "neutral"}><span className="sr-only">{i18n.text(messages[status])} · </span>
                <span className="block truncate">{index + 1}. {item.label ?? item.question}</span>
              </StatusText>
            </Button>;
          })}
          <Button type="button" size="xs" variant={review ? "selected" : "ghost"} aria-current={review ? "step" : undefined}
            onClick={() => navigate(questions.length)}>{i18n.text(messages.review)}</Button>
        </nav></AgentScrollArea>}
        {expanded
          ? <AgentScrollArea ref={scroller} className="max-h-[60dvh]">{content}</AgentScrollArea>
          : <div className="min-w-0">{content}</div>}
        {failed && <StatusText tone="error">{i18n.text(messages.submitFailed)}</StatusText>}
        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={cancel}>{i18n.text(messages.cancel)}</Button>
            {onEnlarge && <IconButton type="button" label={i18n.text(messages.enlarge)} onClick={onEnlarge}><Maximize2 /></IconButton>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {question && !question.required && !draft.answers[draft.page]!.skipped && <Button type="button" size="sm" variant="ghost"
              onClick={() => { setInvalidId(null); update({ ...draft,
                answers: draft.answers.map((answer, index) => index === draft.page ? { ...answer, skipped: true } : answer),
                page: questions.length > 1 ? draft.page + 1 : draft.page,
              }); }}>{i18n.text(messages.skip)}</Button>}
            {draft.page > 0 && <Button type="button" size="sm" variant="outline" onClick={() => navigate(draft.page - 1)}>
              <ArrowLeft />{i18n.text(messages.previous)}
            </Button>}
            {questions.length > 1 && !review ? <Button type="button" size="sm" onClick={() => navigate(draft.page + 1)}>
              {i18n.text(draft.page === questions.length - 1 ? messages.review : messages.next)}<ArrowRight />
            </Button> : <Button type="button" size="sm" title="⌘ / Ctrl + Enter" onClick={() => submit()}>
              {busy ? <Spinner /> : <Send />}{i18n.text(questions.length === 1 ? messages.answerSingle : messages.answer)}
            </Button>}
          </div>
        </div>
      </fieldset>
    </form>
  </div>;
}
