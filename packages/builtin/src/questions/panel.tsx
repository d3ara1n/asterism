import { useMemo, useState, useSyncExternalStore } from "react";
import { useI18n, useRendererCalls, useRendererObject } from "@asterism/sdk/renderer";
import { AgentModal } from "@asterism/builtin-api/renderer";
import { Button } from "@asterism/ui/ui/button";
import { questionMessages as messages } from "../messages/questions";
import { answerIssue } from "./answers";
import { AnswerQuestion, CancelQuestion, type Question } from "./contract";
import { draftSubmission, questionDrafts } from "./drafts";
import { QuestionForm } from "./form";

/** 工具执行正文内的作答界面；草稿按等待实例保留，条目卸载或切到放大视图均不丢失。 */
export function QuestionPanel({ requestId, questions }: { requestId: string; questions: Question[] }) {
  const { ref } = useRendererObject();
  const calls = useRendererCalls();
  const i18n = useI18n();
  const entry = useMemo(() => questionDrafts.get(ref.sessionId, ref.id, { id: requestId, questions }), [ref.sessionId, ref.id, requestId]);
  const draft = useSyncExternalStore(entry.subscribe, entry.getSnapshot);
  const { busy, failed } = useSyncExternalStore(entry.subscribe, entry.getOperationSnapshot);
  const [invalidId, setInvalidId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const object = { id: ref.id, sessionId: ref.sessionId, kind: ref.kind };
  const submission = draftSubmission(questions, draft);
  const done = questions.filter((question, index) => !answerIssue(question, submission.answers[index])).length;
  const progress = i18n.formatMessage(messages.progress, { done, total: questions.length });
  const form = (large: boolean) => <QuestionForm questions={questions} draft={draft} update={entry.update}
    answer={value => { void entry.perform(async () => { await calls.invoke(AnswerQuestion, { id: requestId, submission: value }, { object }); }); }}
    cancel={() => { void entry.perform(async () => { await calls.invoke(CancelQuestion, { id: requestId }, { object }); }); }}
    busy={busy} failed={failed} invalidId={invalidId} setInvalidId={setInvalidId} expanded={large}
    onEnlarge={large ? undefined : () => setExpanded(true)} />;
  return <>
    {expanded ? <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="type-caption text-muted-foreground" aria-live="polite">{progress}</p>
      <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>{i18n.text(messages.return)}</Button>
    </div> : form(false)}
    <AgentModal open={expanded} onOpenChange={setExpanded} size="wide" title={messages.title} description={progress}>
      {expanded && form(true)}
    </AgentModal>
  </>;
}
