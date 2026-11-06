import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import { CharacterCount, Placeholder, UndoRedo } from "@tiptap/extensions";
import { Suggestion, exitSuggestion, findSuggestionMatch } from "@tiptap/suggestion";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { skillUrl } from "@asterism-app/sdk/contracts";
import { hasReferenceDrag, readReferenceDrag } from "@asterism-app/sdk/renderer";
import { ReferenceChip } from "./reference-node";
import { parseComposerInline, parseComposerText, referenceNodeName, referenceTriggerAllowedAfter, serializeDoc } from "./reference-serialization";
import { ReferenceMenu, type ReferenceMenuHandle } from "./reference-menu";
import { composerTextLimit } from "./draft";

export interface ComposerEditorHandle {
  focus(): void;
}

const suggestionKey = new PluginKey("referenceSuggestion");

/** Live callbacks, labels and menu state read by the editor's extensions, which are created once per editor. */
interface EditorBridge {
  placeholder: string;
  label: string;
  submit(): void;
  change(text: string): void;
  suggestion(value: { query: string; range: Range } | null): void;
  menu: ReferenceMenuHandle | null;
  /** Listbox id while the menu is open, and its active option for aria-activedescendant. */
  listId: string | null;
  activeId: string | null;
}

/** `@` opens the reference menu; the plugin owns trigger matching, dismissal and IME composition state. */
function referenceSuggestion(bridge: { current: EditorBridge }) {
  return Extension.create({
    name: "referenceSuggestion",
    // Runs before the submit keymap so Enter activates a menu row while the menu is open.
    priority: 1000,
    addProseMirrorPlugins() {
      return [Suggestion({
        editor: this.editor,
        pluginKey: suggestionKey,
        char: "@",
        allowedPrefixes: null,
        findSuggestionMatch: config => {
          const match = findSuggestionMatch(config);
          if (!match) return null;
          const doc = config.$position.doc;
          const previous = match.range.from > 0 ? doc.textBetween(match.range.from - 1, match.range.from, "\n", "\uFFFC") : "";
          return referenceTriggerAllowedAfter(previous) ? match : null;
        },
        allow: ({ editor }) => editor.isEditable,
        render: () => ({
          onStart: ({ query, range }) => bridge.current.suggestion({ query, range }),
          onUpdate: ({ query, range }) => bridge.current.suggestion({ query, range }),
          onExit: () => bridge.current.suggestion(null),
          onKeyDown: ({ event }) => bridge.current.menu?.keyDown(event) ?? false,
        }),
      })];
    },
  });
}

/** Enter submits the form; Shift+Enter and Mod+Enter keep the hard-break binding. IME composition never reaches keymaps. */
function submitOnEnter(bridge: { current: EditorBridge }) {
  return Extension.create({
    name: "submitOnEnter",
    priority: 900,
    addKeyboardShortcuts() {
      return { Enter: () => { bridge.current.submit(); return true; } };
    },
  });
}

/** Dropped reference text is inserted at the drop point and parsed like typed text; file drops keep the attachment path. */
const referenceDrop = Extension.create({
  name: "referenceDrop",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      props: {
        handleDOMEvents: {
          dragover: (_view, event) => {
            if (!event.dataTransfer || !hasReferenceDrag(event.dataTransfer)) return false;
            event.preventDefault();
            event.dataTransfer.dropEffect = editor.isEditable ? "copy" : "none";
            return true;
          },
        },
        handleDrop: (view, event) => {
          const text = event.dataTransfer && readReferenceDrag(event.dataTransfer);
          if (text == null) return false;
          event.preventDefault();
          if (!editor.isEditable || !text) return true;
          const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.to;
          editor.chain().focus().insertContentAt(position, [...parseComposerInline(text), { type: "text", text: " " }]).run();
          return true;
        },
      },
    })];
  },
});

function createOptions(bridge: { current: EditorBridge }) {
  return {
    extensions: [
      Document, Paragraph, Text, HardBreak, UndoRedo, ReferenceChip,
      CharacterCount.configure({ limit: composerTextLimit }),
      Placeholder.configure({ placeholder: () => bridge.current.placeholder }),
      referenceSuggestion(bridge), submitOnEnter(bridge), referenceDrop,
    ],
    editorProps: {
      attributes: () => {
        const { label, listId, activeId } = bridge.current;
        return {
          "data-slot": "input-group-control",
          "aria-label": label,
          "aria-multiline": "true",
          "aria-haspopup": "listbox",
          "aria-expanded": listId ? "true" : "false",
          // ProseMirror stringifies attribute values, so absent relations are omitted rather than undefined.
          ...listId ? { "aria-controls": listId } : {},
          ...activeId ? { "aria-activedescendant": activeId } : {},
          class: "min-h-16 max-h-60 w-full cursor-text overflow-y-auto px-3 py-3 text-base outline-none md:text-sm [&[contenteditable=false]]:cursor-default "
            + "[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left "
            + "[&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground "
            + "[&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
        };
      },
    },
    onUpdate: ({ editor }: { editor: Editor }) => bridge.current.change(serializeDoc(editor.getJSON())),
    onBlur: ({ editor }: { editor: Editor }) => exitSuggestion(editor.view, suggestionKey),
  };
}

/**
 * Composer text field with inline reference chips. The draft text is the source of truth: edits are serialized into it,
 * and external changes (restore, send, discard) replace the document when they differ from the current serialization.
 */
export function ComposerEditor({ ref, value, placeholder, label, disabled, onChange, onSubmit }: {
  ref: Ref<ComposerEditorHandle>; value: string; placeholder: string; label: string; disabled: boolean;
  onChange(text: string): void; onSubmit(): void;
}) {
  const [suggestion, setSuggestion] = useState<{ query: string; range: Range } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const listId = useId();
  const bridge = useRef<EditorBridge>(null!);
  bridge.current ??= { placeholder, label, submit: onSubmit, change: onChange, suggestion: setSuggestion, menu: null, listId: null, activeId: null };
  Object.assign(bridge.current, { placeholder, label, submit: onSubmit, change: onChange,
    listId: suggestion ? listId : null, activeId: suggestion ? activeId : null });
  // Options stay referentially stable so the React binding never resets the editor's view props.
  const [options] = useState(() => createOptions(bridge));
  const editor = useEditor(options, []);

  useImperativeHandle(ref, () => ({
    focus: () => { editor.commands.focus(null, { scrollIntoView: false }); },
  }), [editor]);

  useEffect(() => {
    if (serializeDoc(editor.getJSON()) === value) return;
    editor.chain().setMeta("addToHistory", false).setContent(parseComposerText(value), { emitUpdate: false }).run();
  }, [editor, value]);

  useEffect(() => { editor.setEditable(!disabled, false); }, [editor, disabled]);

  // Placeholder, label and menu ARIA state are read from the bridge during decoration and attribute updates;
  // an empty transaction refreshes them.
  const open = suggestion !== null;
  useEffect(() => { editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false)); },
    [editor, placeholder, label, open, activeId]);

  return <div className="relative w-full min-w-0">
    <EditorContent editor={editor} />
    {suggestion && <ReferenceMenu ref={menu => { bridge.current.menu = menu; }} listId={listId} query={suggestion.query}
      onActiveChange={setActiveId}
      onSelect={skill => {
        editor.chain().focus()
          .insertContentAt(suggestion.range, [
            { type: referenceNodeName, attrs: { label: skill.name, href: skillUrl(skill.name) } }, { type: "text", text: " " }])
          .run();
      }} />}
  </div>;
}
