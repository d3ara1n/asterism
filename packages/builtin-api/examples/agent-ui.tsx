import { useState } from "react";
import type { ResourceRef } from "@atelier/sdk/contracts";
import { AgentModal, AgentOverlay, agentUI, type AgentOverlayPosition } from "@atelier/builtin-api/renderer";
import { useRendererObject, type RendererModule } from "@atelier/sdk/renderer";

/** 插件按关联 Agent 提供业务状态与提交回调，界面只消费该接口。 */
export interface AgentUIState {
  question: { id: string; text: string; answer(value: string): Promise<void> } | null;
  todos: readonly string[];
  todoPosition: AgentOverlayPosition;
  preview: { title: string; url: string } | null;
  closePreview(): void;
}

/** useStateForAgent 由插件提供，可订阅自己的业务服务，并在重挂载时重读当前状态。 */
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
  // 第三方作者可使用自己的控件库；示例只依赖公开包和 React。
  return <form onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    void question.answer(answer).catch(error => {
      setError(error instanceof Error ? error.message : String(error));
    }).finally(() => { setBusy(false); });
  }}>
    <label>{question.text}<input value={answer} disabled={busy} onChange={event => setAnswer(event.target.value)} /></label>
    <button type="submit" disabled={busy}>Answer</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
