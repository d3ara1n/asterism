import type { EditorState } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";

interface Hint {
  label: string | null;
  className?: string;
  text?: string;
  ariaLabel?: string | null;
}
type HintSource = Hint | ((state: EditorState) => Hint);
export type RenderHint = (dom: HTMLElement, hint: HintSource) => () => void;
export interface HintPortal extends Hint { id: number; dom: HTMLElement }

/** CodeMirror owns hosts; React owns their visible contents in the editor's existing context. */
export function createHintPortals(publish: (portals: HintPortal[]) => void) {
  const hosts = new Map<HTMLElement, { id: number; hint: HintSource }>();
  let nextId = 0;
  let view: EditorView | null = null;
  let disposed = false;
  let current: HintPortal[] = [];
  const measure = {
    read() {},
    write() {
      if (!view) return;
      const next: HintPortal[] = [];
      for (const [dom, { id, hint }] of hosts) {
        // Renderer hooks have no destroy callback. Prune only our registered hosts, after
        // CodeMirror has drawn the document and gutters (also on viewport-only updates).
        if (!view.dom.contains(dom)) { hosts.delete(dom); continue; }
        next.push({ id, dom, ...(typeof hint === "function" ? hint(view.state) : hint) });
      }
      if (next.length === current.length && next.every((hint, index) => {
        const previous = current[index]!;
        return hint.id === previous.id && hint.label === previous.label && hint.ariaLabel === previous.ariaLabel &&
          hint.className === previous.className && hint.text === previous.text;
      })) return;
      current = next;
      publish(next);
    },
  };
  const schedule = () => view?.requestMeasure(measure);
  const render: RenderHint = (dom, hint) => {
    if (disposed) return () => {};
    hosts.set(dom, { id: nextId++, hint });
    schedule();
    // Git gutter markers do expose destruction, so they can release their host eagerly.
    return () => { if (hosts.delete(dom)) schedule(); };
  };
  const extension = ViewPlugin.define(editor => {
    view = editor;
    schedule();
    return {
      update: schedule,
      destroy() {
        disposed = true;
        view = null;
        hosts.clear();
        current = [];
        publish([]);
      },
    };
  });
  return { render, extension };
}

export function hintHost(render: RenderHint, hint: HintSource) {
  const dom = document.createElement("span");
  // Inline widgets need a host box: CodeMirror reads its client rects for cursor geometry.
  render(dom, hint);
  return dom;
}
