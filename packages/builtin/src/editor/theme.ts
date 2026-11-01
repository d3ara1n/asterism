import { EditorView } from "@codemirror/view";

/** Editor chrome follows the application's live theme variables. */
export const editorTheme = EditorView.theme({
  "&": { height: "100%", color: "var(--foreground)", backgroundColor: "var(--card)", fontSize: "var(--code-font-size, 1em)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono)", overscrollBehavior: "contain" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--foreground)" },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": { backgroundColor: "var(--card)", color: "var(--muted-foreground)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 12px" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--selected)" },
  ".cm-selectionMatch": { backgroundColor: "var(--accent)" },
  ".cm-searchMatch": { backgroundColor: "var(--accent)", outline: "1px solid var(--border)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--selected)", outline: "1px solid var(--ring)" },
  ".cm-foldPlaceholder": { color: "var(--muted-foreground)", backgroundColor: "var(--muted)", borderColor: "var(--border)" },
  ".cm-panels, .cm-tooltip": { color: "var(--foreground)", backgroundColor: "var(--popover)", borderColor: "var(--border)" },
  ".cm-panels": { fontFamily: "var(--font-sans)", fontSize: "13px" },
  ".cm-git-gutter": { width: "6px" },
  ".cm-git-mark": { display: "block", position: "relative", width: "4px", height: "100%", minHeight: "1lh" },
  ".cm-git-added": { borderLeft: "3px solid var(--success)" },
  ".cm-git-modified": { borderLeft: "3px solid var(--primary)" },
  ".cm-git-removed-before::before, .cm-git-removed-after::after": {
    content: '""', position: "absolute", left: "0", borderTop: "4px solid transparent",
    borderBottom: "4px solid transparent", borderLeft: "5px solid var(--destructive)",
  },
  ".cm-git-removed-before::before": { top: "-4px" },
  ".cm-git-removed-after::after": { bottom: "-4px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { color: "var(--selected-foreground)", backgroundColor: "var(--selected)" },
});
