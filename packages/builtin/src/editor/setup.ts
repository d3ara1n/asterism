import { EditorState } from "@codemirror/state";
import {
  lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightActiveLine, keymap,
} from "@codemirror/view";
import {
  foldGutter, codeFolding, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap,
} from "@codemirror/language";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { hintHost, type RenderHint } from "./hint-portals.ts";

/** The codemirror basicSetup extensions and keymap order, with application-owned hint renderers. */
export function editorSetup(render: RenderHint) {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars({ render: (_code, description, placeholder) => hintHost(render, {
      className: "cm-specialChar", text: placeholder, label: description, ariaLabel: description,
    }) }),
    history(),
    foldGutter({ markerDOM: open => {
      const dom = hintHost(render, state => ({
        text: open ? "⌄" : "›",
        // markerDOM receives no view; the bridge resolves phrases from its owning editor.
        label: state.phrase(open ? "Fold line" : "Unfold line"),
        ariaLabel: state.phrase(open ? "Fold line" : "Unfold line"),
      }));
      // The fold gutter styles every span; only the React trigger should have a padding box.
      dom.style.display = "contents";
      return dom;
    } }),
    codeFolding({ placeholderDOM: (_view, onclick) => {
      const dom = hintHost(render, state => ({
        className: "cm-foldPlaceholder", text: "…",
        label: state.phrase("unfold"), ariaLabel: state.phrase("folded code"),
      }));
      // Keep CodeMirror's native handler, including posAtDOM and preventDefault semantics.
      dom.onclick = onclick;
      return dom;
    } }),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
    ]),
  ];
}
