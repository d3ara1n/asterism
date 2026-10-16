import { useEffect, useId, useRef, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, MessageSquarePlus, Pencil, Send } from "lucide-react";
import { useI18n } from "@atelier/sdk/renderer";
import { AgentScrollArea } from "@atelier/builtin-api/renderer";
import { Button } from "@atelier/ui/ui/button";
import { Textarea } from "@atelier/ui/ui/textarea";
import { Field, FieldDescription, FieldLabel } from "@atelier/ui/ui/field";
import { StatusText } from "@atelier/ui/ui/status";
import { Spinner } from "@atelier/ui/ui/spinner";
import { Separator } from "@atelier/ui/ui/separator";
import { questionMessages as messages } from "../messages/questions";
import { answerIssue } from "./answers";
import type { PendingQuestion, Submission } from "./contract";
import { draftSubmission, type QuestionDraft } from "./drafts";
import { QuestionFields } from "./question-fields";

export function QuestionForm({ pending, draft, update, answer, cancel, busy, failed, invalidId, setInvalidId, expanded, focusVersion }: {
  pending: PendingQuestion; draft: QuestionDraft; update(value: QuestionDraft): void;
  answer(value: Submission): void; cancel(): void; busy: boolean; failed: boolean;
  invalidId: string | null; setInvalidId(id: string | null): void; expanded: boolean; focusVersion: number;
}) {
  const i18n = useI18n();
  const messageId = useId();
  const region = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { questions } = pending;
  const review = draft.page >= questions.length;
  const question = questions[draft.page];
  const submission = draftSubmission(questions, draft);
  useEffect(() => { if (focusVersion) region.current?.focus({ preventScroll: true }); }, [focusVersion]);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [draft.page]);
  const navigate = (page: number) => update({ ...draft, page, detail: null });
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
  return <div ref={region} tabIndex={-1} className="min-h-0 outline-none" aria-label={i18n.text(messages.navigation)}>
    <form onSubmit={submit} onKeyDown={event => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
    }}>
      <fieldset disabled={busy} className="flex min-h-0 flex-col gap-3">
        {questions.length > 1 && <AgentScrollArea axis="horizontal"><nav className="flex gap-1" aria-label={i18n.text(messages.navigation)}>
          {questions.map((item, index) => {
            const status = submission.answers[index]?.status === "skipped" ? "skipped" : answerIssue(item, submission.answers[index]) ? "pending" : "answered";
            return <Button key={item.id} type="button" size="xs" variant={index === draft.page ? "secondary" : "ghost"}
              className="max-w-40 shrink-0" aria-current={index === draft.page ? "step" : undefined} onClick={() => navigate(index)}
              title={`${item.question} · ${i18n.text(messages[status])}`}>
              <StatusText tone={status === "answered" ? "success" : "neutral"}><span className="sr-only">{i18n.text(messages[status])} · </span>
                <span className="block truncate">{index + 1}. {item.label ?? item.question}</span>
              </StatusText>
            </Button>;
          })}
          <Button type="button" size="xs" variant={review ? "secondary" : "ghost"} aria-current={review ? "step" : undefined}
            onClick={() => navigate(questions.length)}>{i18n.text(messages.review)}</Button>
        </nav></AgentScrollArea>}
        <AgentScrollArea ref={scroller} className={`@container/questions ${expanded ? "max-h-[60dvh]" : "max-h-[min(16rem,30cqh)]"}`}>
          <div className="space-y-4">
            {question && <QuestionFields key={question.id} question={question} value={draft.answers[draft.page]!}
              update={value => { setInvalidId(null); update({ ...draft, answers: draft.answers.map((answer, index) => index === draft.page ? value : answer) }); }}
              invalid={invalidId === question.id} detail={draft.detail} setDetail={detail => update({ ...draft, detail })} />}
            {review && <div className="space-y-4">
              <p className="type-section">{i18n.text(messages.review)}</p>
              {questions.map((item, index) => {
                const response = submission.answers[index]!;
                const missing = answerIssue(item, response);
                return <div key={item.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="type-label break-words">{index + 1}. {item.question}</p>
                    <Button type="button" size="xs" variant="ghost" onClick={() => navigate(index)}><Pencil />{i18n.text(messages.edit)}</Button>
                  </div>
                  {response.status === "skipped" ? <StatusText tone="neutral">{i18n.text(messages.skipped)}</StatusText>
                    : missing ? <StatusText tone="warning">{i18n.text(messages.pending)}</StatusText>
                    : <div className="space-y-1 type-body whitespace-pre-wrap break-words">
                      {item.type !== "text" && item.options.filter(option => response.selected.includes(option.id)).map(option => <p key={option.id}>{option.label}</p>)}
                      {response.text && <p>{response.text}</p>}
                    </div>}
                  <Separator />
                </div>;
              })}
            </div>}
            {(review || questions.length === 1) && (draft.messageOpen ? <Field>
              <FieldLabel htmlFor={messageId}>{i18n.text(messages.message)}</FieldLabel>
              <FieldDescription>{i18n.text(messages.messageHint)}</FieldDescription>
              <Textarea id={messageId} rows={2} value={draft.message} onChange={event => update({ ...draft, message: event.target.value })} />
            </Field> : <Button type="button" variant="ghost" size="sm" onClick={() => update({ ...draft, messageOpen: true })}>
              <MessageSquarePlus />{i18n.text(messages.message)}
            </Button>)}
          </div>
        </AgentScrollArea>
        {failed && <StatusText tone="error">{i18n.text(messages.submitFailed)}</StatusText>}
        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={cancel}>{i18n.text(messages.cancel)}</Button>
          <div className="flex flex-wrap items-center gap-2">
            {question && !question.required && !draft.answers[draft.page]!.skipped && <Button type="button" size="sm" variant="ghost"
              onClick={() => { setInvalidId(null); update({ ...draft, detail: null,
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
