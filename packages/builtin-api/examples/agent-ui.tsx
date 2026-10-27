import { useState } from "react";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import { AgentModal, AgentOverlay, AgentScrollArea, agentUI, type AgentOverlayPosition } from "@asterism-app/builtin-api/renderer";
import { useRendererObject, type RendererModule } from "@asterism-app/sdk/renderer";

/** Plugins provide business state and submission callbacks for the associated Agent; the UI only consumes this interface. */
export interface AgentUIState {
  question: { id: string; text: string; answer(value: string): Promise<void> } | null;
  todos: readonly string[];
  todoPosition: AgentOverlayPosition;
  preview: { title: string; url: string } | null;
  closePreview(): void;
}

/** useStateForAgent is provided by the plugin, which can subscribe to its own business service and reread the current state on remount. */
export function questionAndTodoViews(
  useStateForAgent: (agent: ResourceRef) => AgentUIState,
): RendererModule {
  function Extension() {
    const object = useRendererObject();
    const state = useStateForAgent(object.ref);
    return <>
      {!!state.todos.length && <AgentOverlay position={state.todoPosition}>
        <ul>{state.todos.map((text, index) => <li key={index}>{text}</li>)}</ul>
      </AgentOverlay>}
      {state.question && <AgentOverlay position="bottom" hideComposer>
        <Question key={state.question.id} question={state.question} />
      </AgentOverlay>}
      <AgentModal open={!!state.preview} title={state.preview?.title ?? "Preview"}
        onOpenChange={open => { if (!open) state.closePreview(); }}>
        {state.preview && <img src={state.preview.url} alt={state.preview.title} />}
      </AgentModal>
    </>;
  }
  return {
    resources: [], cards: [], tools: [],
    async prepare({ signal }) {
      agentUI.register({ id: "example.questions/agent-ui", Component: Extension }, { signal });
    },
  };
}

function Question({ question }: { question: NonNullable<AgentUIState["question"]> }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Third-party authors can use their own control libraries; this example depends only on public packages and React.
  return <form onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    void question.answer(answer).catch(error => {
      setError(error instanceof Error ? error.message : String(error));
    }).finally(() => { setBusy(false); });
  }}>
    <AgentScrollArea style={{ maxHeight: "16rem" }}>
      <label>{question.text}<input value={answer} disabled={busy} onChange={event => setAnswer(event.target.value)} /></label>
    </AgentScrollArea>
    <button type="submit" disabled={busy}>Answer</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
