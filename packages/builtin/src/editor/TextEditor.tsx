import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { LanguageDescription, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { getSearchQuery, openSearchPanel, search, type SearchQuery } from "@codemirror/search";
import { chinesePhrases } from "./phrases.ts";
import { editorTheme } from "./theme.ts";
import { loadEditorHighlightStyle } from "./highlight.ts";
import { SearchPanel } from "./SearchPanel";
import { gitGutter, setGitBaseline } from "./git-gutter";
import { createHintPortals, type HintPortal } from "./hint-portals";
import { HintPortals } from "./HintPortals";
import { editorSetup } from "./setup";
import { resolveLineSelection, type TextEditorNavigation } from "./navigation";
import { editorMessages as messages } from "../messages/editor";

export interface TextEditorHandle { find(): void }

/** A text editing surface independent of files, resource identity, and island placement. */
export function TextEditor({ ref, filename, initialText, readOnly = false, lineWrapping = false, gitBase = null, navigation, onChange, onSave, onPosition, onLanguageError }: {
  ref?: Ref<TextEditorHandle>;
  filename: string;
  initialText: string;
  readOnly?: boolean;
  lineWrapping?: boolean;
  gitBase?: string | null;
  navigation?: TextEditorNavigation;
  onChange?(text: string): void;
  onSave?(): void;
  onPosition(position: { line: number; column: number }): void;
  onLanguageError(error: unknown): void;
}) {
  const i18n = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const settings = useRef(new Compartment()).current;
  const [panel, setPanel] = useState<{ dom: HTMLElement; view: EditorView; query: SearchQuery } | null>(null);
  const [hints, setHints] = useState<HintPortal[]>([]);
  const callbacks = useRef({ onChange, onSave, onPosition, onLanguageError });
  callbacks.current = { onChange, onSave, onPosition, onLanguageError };
  useImperativeHandle(ref, () => ({ find() { if (editor.current) openSearchPanel(editor.current); } }), []);

  useEffect(() => {
    const language = new Compartment();
    const highlighting = new Compartment();
    const hintPortals = createHintPortals(setHints);
    const view = new EditorView({
      parent: container.current!,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          hintPortals.extension, editorSetup(hintPortals.render), editorTheme, highlighting.of([]),
          gitGutter(hintPortals.render),
          search({ top: true, createPanel: view => {
            const dom = document.createElement("div");
            let query = getSearchQuery(view.state);
            return {
              dom, top: true,
              mount() { setPanel({ dom, view, query }); },
              update(update) {
                const next = getSearchQuery(update.state);
                if (!query.eq(next)) { query = next; setPanel({ dom, view, query }); }
              },
              destroy() { setPanel(null); },
            };
          } }),
          settings.of([]), language.of([]),
          EditorView.contentAttributes.of({ "aria-label": filename }),
          Prec.highest(keymap.of([{ key: "Mod-s", run: () => { callbacks.current.onSave?.(); return true; } }])),
          keymap.of([indentWithTab]),
          EditorView.updateListener.of(update => {
            if (update.docChanged) callbacks.current.onChange?.(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              callbacks.current.onPosition({ line: line.number, column: head - line.from + 1 });
            }
          }),
        ],
      }),
    });
    editor.current = view;
    // Host appearance changes update inherited CSS variables without recreating the editor.
    const appearance = new MutationObserver(() => view.requestMeasure());
    appearance.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    let active = true;
    const description = LanguageDescription.matchFilename(languages, filename);
    if (description) void description.load().then(support => {
      if (active) view.dispatch({ effects: language.reconfigure(support) });
    }).catch(error => { if (active) callbacks.current.onLanguageError(error); });
    void loadEditorHighlightStyle().then(style => {
      if (active) view.dispatch({ effects: highlighting.reconfigure(syntaxHighlighting(style)) });
    }).catch(error => { if (active) callbacks.current.onLanguageError(error); });
    const frame = requestAnimationFrame(() => view.focus());
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      editor.current = null;
      appearance.disconnect();
      view.destroy();
    };
  }, [filename, initialText, settings]);

  // Portal contents arrive after CodeMirror draws its hosts; measure their committed geometry.
  useLayoutEffect(() => { editor.current?.requestMeasure(); }, [hints]);

  useEffect(() => {
    editor.current?.dispatch({ effects: settings.reconfigure([
      lineWrapping ? EditorView.lineWrapping : [],
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of(readOnly ? { tabindex: "0", "aria-readonly": "true" } : {}),
      EditorState.phrases.of(i18n.interfaceLocale === "zh-Hans" ? chinesePhrases : {}),
    ]) });
  }, [readOnly, lineWrapping, i18n.interfaceLocale, filename, initialText, settings]);

  useEffect(() => {
    editor.current?.dispatch({ effects: setGitBaseline.of({ text: gitBase, labels: {
      added: i18n.text(messages.lineAdded), modified: i18n.text(messages.lineModified), removed: i18n.text(messages.linesRemoved),
    } }) });
  }, [gitBase, i18n, filename, initialText]);

  useEffect(() => {
    const view = editor.current;
    if (!view || !navigation) return;
    const selection = resolveLineSelection(view.state.doc, navigation);
    if (!selection) return;
    view.dispatch({ selection, effects: EditorView.scrollIntoView(selection.anchor, { y: navigation.endLine === undefined ? "center" : "start" }) });
    view.focus();
  }, [navigation]);

  return <><div ref={container} className="min-h-0 flex-1 overflow-hidden text-sm" />
    {panel && createPortal(<SearchPanel view={panel.view} query={panel.query} readOnly={readOnly} />, panel.dom)}
    <HintPortals portals={hints} />
  </>;
}
