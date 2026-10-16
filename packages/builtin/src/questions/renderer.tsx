import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Maximize2, MessageCircleQuestion, RefreshCw } from "lucide-react";
import { agentUI, AgentModal, AgentOverlay } from "@atelier/builtin-api/renderer";
import { builtin } from "@atelier/builtin-api/contracts";
import { useI18n, useRendererObject, type RendererModule } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@atelier/ui/ui/select";
import { Alert, AlertDescription } from "@atelier/ui/ui/alert";
import { QuestionsChanged, type PendingQuestion, type Submission } from "./contract";
import { questionMessages as messages } from "../messages/questions";
import { useQuestions } from "./use-questions";
import { draftSubmission, questionDrafts } from "./drafts";
import { answerIssue } from "./answers";
import { QuestionForm } from "./form";
import { questionFocus } from "./focus";
import { questionToolRenderer } from "./tool-view";

function Questions() {
  const { ref } = useRendererObject();
  const state = useQuestions(ref);
  const i18n = useI18n();
  const [active, setActive] = useState<string | null>(null);
  const [focusVersion, setFocusVersion] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pending = state.pending.find(item => item.id === active) ?? state.pending[0];
  useEffect(() => questionFocus.subscribe((object, id) => {
    if (object.id !== ref.id || object.sessionId !== ref.sessionId || object.kind !== ref.kind) return;
    setActive(id); setCollapsed(false); setFocusVersion(value => value + 1);
  }), [ref.id, ref.sessionId, ref.kind]);
  const failure = state.failed && <Alert><AlertDescription>
    {i18n.text(messages.failed)}
    <Button variant="outline" size="sm" onClick={state.refresh}><RefreshCw />{i18n.text(messages.refresh)}</Button>
  </AlertDescription></Alert>;
  if (!pending) return failure ? <AgentOverlay position="bottom">{failure}</AgentOverlay> : null;
  return <Interaction key={pending.id} pending={pending} answer={submission => state.answer(pending.id, submission)} cancel={() => state.cancel(pending.id)}
    collapsed={collapsed} setCollapsed={setCollapsed} expanded={expanded} setExpanded={setExpanded} focusVersion={focusVersion}>
    {failure}
    {state.pending.length > 1 && <div className="space-y-1">
      <p className="type-caption text-muted-foreground">{i18n.formatMessage(messages.groups, { count: state.pending.length })}</p>
      <Select value={pending.id} onValueChange={setActive}>
        <SelectTrigger className="w-full" aria-label={i18n.formatMessage(messages.groups, { count: state.pending.length })}><SelectValue /></SelectTrigger>
        <SelectContent>{state.pending.map((item, index) => <SelectItem key={item.id} value={item.id}>
          {index + 1}. {item.questions[0]?.label ?? item.questions[0]?.question}
        </SelectItem>)}</SelectContent>
      </Select>
    </div>}
  </Interaction>;
}

function Interaction({ pending, answer, cancel, children, collapsed, setCollapsed, expanded, setExpanded, focusVersion }: {
  pending: PendingQuestion; answer(value: Submission): Promise<void>; cancel(): Promise<void>;
  children: ReactNode; collapsed: boolean; setCollapsed(value: boolean): void; focusVersion: number;
  expanded: boolean; setExpanded(value: boolean): void;
}) {
  const { ref } = useRendererObject();
  const i18n = useI18n();
  const entry = useMemo(() => questionDrafts.get(ref.sessionId, ref.id, pending), [ref.sessionId, ref.id, pending.id]);
  const draft = useSyncExternalStore(entry.subscribe, entry.getSnapshot);
  const { busy, failed } = useSyncExternalStore(entry.subscribe, entry.getOperationSnapshot);
  const [invalidId, setInvalidId] = useState<string | null>(null);
  const submission = draftSubmission(pending.questions, draft);
  const done = pending.questions.filter((question, index) => !answerIssue(question, submission.answers[index])).length;
  const progress = i18n.formatMessage(messages.progress, { done, total: pending.questions.length });
  const form = <QuestionForm pending={pending} draft={draft} update={entry.update} answer={submission => { void entry.perform(() => answer(submission)); }}
    cancel={() => { void entry.perform(cancel); }} busy={busy} failed={failed} expanded={expanded}
    invalidId={invalidId} setInvalidId={setInvalidId} focusVersion={focusVersion} />;
  return <>
    <AgentOverlay position="bottom" hideComposer>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="type-label truncate">{i18n.text(messages.title)}</p>
            <p className="type-caption text-muted-foreground" aria-live="polite">{progress}</p>
          </div>
          <IconButton type="button" label={i18n.text(messages.enlarge)} onClick={() => setExpanded(true)}><Maximize2 /></IconButton>
          <IconButton type="button" label={i18n.text(collapsed ? messages.expand : messages.collapse)} aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronUp /> : <ChevronDown />}</IconButton>
        </div>
        {!collapsed && !expanded && <>{children}{form}</>}
        {expanded && <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>{i18n.text(messages.return)}</Button>}
      </div>
    </AgentOverlay>
    <AgentModal open={expanded} onOpenChange={setExpanded} size="wide" title={messages.title} description={progress}>
      {children}{expanded && form}
    </AgentModal>
  </>;
}
export default {
  resources: [], cards: [], tools: [questionToolRenderer],
  async prepare({ signal, events }) {
    const subscription = events.subscribe(QuestionsChanged, { delivery: "latest", signal }, ({ data }) => {
      questionDrafts.reconcile(data.sessionId, data.agentId, data.version, data.pendingIds);
    });
    signal.addEventListener("abort", () => questionDrafts.clear(), { once: true });
    await subscription.ready;
    agentUI.register({ id: builtin.name("questions"), Component: Questions }, { signal });
  },
} satisfies RendererModule;
