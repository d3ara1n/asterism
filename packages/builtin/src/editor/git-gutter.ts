import { RangeSet, StateEffect, StateField } from "@codemirror/state";
import { GutterMarker, gutter, ViewPlugin } from "@codemirror/view";
import { diffLines } from "diff";
import { marksFromChanges, type LineMark } from "./line-marks.ts";
import type { RenderHint } from "./hint-portals.ts";

interface MarkLabels { added: string; modified: string; removed: string }
const setGitMarks = StateEffect.define<{ marks: LineMark[]; labels: MarkLabels }>();
export const setGitBaseline = StateEffect.define<{ text: string | null; labels: MarkLabels }>();
const baseline = StateField.define<{ text: string | null; labels: MarkLabels } | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setGitBaseline)) value = effect.value;
    return value;
  },
});

class ChangeMarker extends GutterMarker {
  private readonly cleanups = new WeakMap<Node, () => void>();
  constructor(readonly mark: LineMark, readonly labels: MarkLabels, readonly render: RenderHint) { super(); }
  toDOM() {
    const element = document.createElement("span");
    // React owns the visible marker through a portal; the CodeMirror host has no layout box.
    element.style.display = "contents";
    const className = ["cm-git-mark", this.mark.change && `cm-git-${this.mark.change}`,
      this.mark.removed && `cm-git-removed-${this.mark.removed}`].filter(Boolean).join(" ");
    const label = [this.mark.change && this.labels[this.mark.change], this.mark.removed && this.labels.removed].filter(Boolean).join(". ");
    this.cleanups.set(element, this.render(element, { className, label }));
    return element;
  }
  destroy(dom: Node) {
    this.cleanups.get(dom)?.();
    this.cleanups.delete(dom);
  }
}
export function gitGutter(render: RenderHint) {
  const markers = StateField.define<RangeSet<GutterMarker>>({
    create: () => RangeSet.empty,
    update(value, transaction) {
      value = value.map(transaction.changes);
      for (const effect of transaction.effects) if (effect.is(setGitBaseline) && effect.value.text === null) value = RangeSet.empty;
      for (const effect of transaction.effects) if (effect.is(setGitMarks)) {
        value = RangeSet.of(effect.value.marks.map(mark =>
          new ChangeMarker(mark, effect.value.labels, render).range(transaction.state.doc.line(mark.line).from)), true);
      }
      return value;
    },
  });
  return [
    baseline, markers,
    ViewPlugin.define(view => {
      let cancel = () => {};
      const refresh = () => {
        cancel();
        const base = view.state.field(baseline);
        if (!base || base.text === null) return;
        let active = true;
        cancel = () => { active = false; };
        const document = view.state.doc;
        // Async diff yields between steps; document changes and view disposal cancel publication synchronously.
        diffLines(base.text, document.toString(), { callback: changes => {
          if (active && changes) view.dispatch({ effects: setGitMarks.of({
            marks: marksFromChanges(changes, document.lines), labels: base.labels,
          }) });
        } });
      };
      return {
        update(update) {
          if (update.docChanged || update.startState.field(baseline) !== update.state.field(baseline)) refresh();
        },
        destroy() { cancel(); },
      };
    }),
    gutter({ class: "cm-git-gutter", markers: view => view.state.field(markers) }),
  ];
}
