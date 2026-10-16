import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { agentUI, AgentOverlay } from "@atelier/builtin-api/renderer";
import { builtin } from "@atelier/builtin-api/contracts";
import { toolRenderer, useI18n, useRendererObject, type RendererModule, type ToolRenderProps } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { Textarea } from "@atelier/ui/ui/textarea";
import { ToolHeader } from "@atelier/ui/tool-header";
import { AskUserResult, type Answer, type PendingQuestion } from "./contract";
import { questionMessages as messages } from "../messages/questions";
import { useQuestions } from "./use-questions";

function Questions() {
  const { ref } = useRendererObject();
  const state = useQuestions(ref);
  const i18n = useI18n();
  if (!state.pending.length && !state.failed) return null;
  return <AgentOverlay position="bottom" hideComposer={state.pending.length > 0}>
    <div className="max-h-80 space-y-4 overflow-y-auto">
      {state.failed && <div role="alert" className="space-y-2 type-caption">
        <p>{i18n.text(messages.failed)}</p>
        <Button variant="outline" size="sm" onClick={state.refresh}>{i18n.text(messages.refresh)}</Button>
      </div>}
      {state.pending.map(pending => <QuestionForm key={pending.id} pending={pending}
        answer={answer => state.answer(pending.id, answer)} cancel={() => state.cancel(pending.id)} />)}
    </div>
  </AgentOverlay>;
}

function QuestionForm({ pending, answer, cancel }: {
  pending: PendingQuestion; answer(value: string): Promise<void>; cancel(): Promise<void>;
}) {
  const i18n = useI18n();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const submit = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setFailed(false);
    try { await action(); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit(() => answer(value)); }}>
    <label htmlFor={pending.id} className="block whitespace-pre-wrap type-label">{pending.question}</label>
    <Textarea id={pending.id} value={value} disabled={busy} onChange={event => setValue(event.target.value)} />
    {failed && <p role="alert" className="type-caption">{i18n.text(messages.submitFailed)}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" size="sm" disabled={busy || !value.trim()}>{i18n.text(messages.answer)}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { void submit(cancel); }}>{i18n.text(messages.cancel)}</Button>
    </div>
  </form>;
}

function Header({ phase }: ToolRenderProps<Answer>) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.title)}
    meta={phase !== "settled" ? i18n.text(messages.waiting) : undefined} />;
}
function Result({ result }: ToolRenderProps<Answer>) {
  return result?.data ? <p className="whitespace-pre-wrap type-caption">{result.data.answer}</p> : null;
}
export default {
  resources: [], cards: [],
  tools: [toolRenderer(AskUserResult, {
    label: messages.title, icon: <MessageCircleQuestion className="size-3.5" />,
    input: { headerRenderer: Header }, execution: { headerRenderer: Header }, result: { headerRenderer: Header, bodyRenderer: Result },
  })],
  async prepare({ signal }) { agentUI.register({ id: builtin.name("questions"), Component: Questions }, { signal }); },
} satisfies RendererModule;
