import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@asterism-app/sdk/renderer";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { getSearchQuery, openSearchPanel, search, type SearchQuery } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { chinesePhrases } from "./phrases.ts";
import { editorTheme } from "./theme.ts";
import { SearchPanel } from "./SearchPanel";
import { gitGutter, setGitBaseline } from "./git-gutter";
import { editorMessages as messages } from "../messages/editor";

export interface TextEditorHandle { find(): void }

/** A text editing surface independent of files, resource identity, and island placement. */
export function TextEditor({ ref, filename, initialText, readOnly = false, gitBase = null, onChange, onSave, onPosition, onLanguageError }: {
  ref?: Ref<TextEditorHandle>;
  filename: string;
  initialText: string;
  readOnly?: boolean;
  gitBase?: string | null;
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
  const callbacks = useRef({ onChange, onSave, onPosition, onLanguageError });
  callbacks.current = { onChange, onSave, onPosition, onLanguageError };
  useImperativeHandle(ref, () => ({ find() { if (editor.current) openSearchPanel(editor.current); } }), []);

  useEffect(() => {
    const language = new Compartment();
    const view = new EditorView({
      parent: container.current!,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          basicSetup, editorTheme, syntaxHighlighting(highlightStyle), gitGutter,
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
    const frame = requestAnimationFrame(() => view.focus());
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      editor.current = null;
      appearance.disconnect();
      view.destroy();
    };
  }, [filename, initialText, settings]);

  useEffect(() => {
    editor.current?.dispatch({ effects: settings.reconfigure([
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of(readOnly ? { tabindex: "0", "aria-readonly": "true" } : {}),
      EditorState.phrases.of(i18n.interfaceLocale === "zh-Hans" ? chinesePhrases : {}),
    ]) });
  }, [readOnly, i18n.interfaceLocale, filename, initialText, settings]);

  useEffect(() => {
    editor.current?.dispatch({ effects: setGitBaseline.of({ text: gitBase, labels: {
      added: i18n.text(messages.lineAdded), modified: i18n.text(messages.lineModified), removed: i18n.text(messages.linesRemoved),
    } }) });
  }, [gitBase, i18n, filename, initialText]);

  return <><div ref={container} className="min-h-0 flex-1 overflow-hidden" />
    {panel && createPortal(<SearchPanel view={panel.view} query={panel.query} readOnly={readOnly} />, panel.dom)}
  </>;
}

const highlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: "var(--primary-text)" },
  { tag: [tags.string, tags.regexp], color: "var(--success)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--warning)" },
  { tag: [tags.typeName, tags.className, tags.tagName], color: "var(--primary-text)" },
  { tag: [tags.comment, tags.meta], color: "var(--muted-foreground)" },
  { tag: tags.heading, fontWeight: "bold", color: "var(--primary-text)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.link, textDecoration: "underline" },
  { tag: tags.invalid, color: "var(--destructive)" },
]);
