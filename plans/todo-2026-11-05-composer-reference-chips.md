# Composer reference chips and skill selection

Filed on 2026-11-05. Supersedes `todo-2026-10-25-skill-picker.md`, which posed the open question this work answers.

## Goal

Let users attach structured references — to skills and, in future, to resource locations — inside the composer text flow, so the model receives them as markdown links it can act on. Separate this from binary file attachments, which already exist as a distinct input part type.

## Design decisions

### References are text, not a new input part

A reference is a markdown link in the message text: `[label](resource:id/path)` or `[label](skill:name)`. The model sees plain text with markdown links — no new `AgentInputPart` kind, no protocol change. The conversation history renders these links through `MarkdownLink`, the single place that decides what each destination becomes; Markdown URL transformation passes destinations through unchanged.

Chips are a composer-only UI affordance. When the message leaves the editor, chips become text. This is the core simplification: the structured representation lives only inside the Tiptap editor document.

### Two app-defined URL schemes

`resource:` — addresses a resource instance in the current session. Format: `resource:<resourceId>/<path>`, where the path is interpreted by the resource itself (directory treats it as a file path). Changed from the old `?location=` query format to a path-based URL format: scheme + authority (resourceId) is the external identity, path is the resource-internal locator.

`skill:` — addresses a skill by name through the flat skill catalog. Format: `skill:<name>` or `skill:<name>/<file>`. Resolved by `skill_read`, not by a resource instance. A separate scheme because skills are not resources: they live in an external directory the model cannot directly access, and `skill_read` exists precisely because of this decoupling. The source is the skill catalog, not a directory, folder, or resource.

### Attachment vs reference

Attachments are binary parts sent directly to the model provider (images, files). They appear in the attachment area below the text input. References are inline in the text and point the model to something it can fetch on its own (a file in a directory resource, a skill to read). If a file must be sent as bytes, use the attachment feature; if the model should find it itself, use a reference.

### Tiptap as the editor

The composer uses Tiptap (ProseMirror-based, React integration, MIT-licensed) replacing the plain `InputGroupTextarea`. The custom inline `referenceChip` node is an atom (non-editable, rendered as a React component) that serializes to `[label](href)` via `renderText`. Deserialization parses markdown link patterns matching `resource:` or `skill:` schemes back into chip nodes; non-matching text stays as plain text.

Tiptap packages: `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/extension-document`, `@tiptap/extension-paragraph`, `@tiptap/extension-text`, `@tiptap/extension-hard-break`, `@tiptap/extensions` (Placeholder, UndoRedo, CharacterCount), `@tiptap/suggestion`.

### Two insertion paths

`@` trigger: typing `@` opens a reference menu organized as categories that drill down. Skills is currently the only category; future categories (such as linked resources) join the same root. An empty query at the root lists categories; any query searches items across categories, ranked by name exactness (exact, prefix, word boundary, substring) before description matches. Inside a category, ArrowLeft or Backspace on an empty query returns to the root. Lists are virtualized for catalogs of hundreds of items. Rows have one fixed height; a skill row shows a one-line description with the full text as a native tooltip. Focus stays in the editor; the menu is a listbox referenced through `aria-controls` and `aria-activedescendant`. Selecting an item replaces the `@query` text with a chip. Manually typed `[label](skill:name)` stays as text (the model understands it regardless).

Chips show the reference kind by icon and tone: skills use a violet book icon; resource locations use a blue folder (resource root or trailing slash) or file icon. Rendered messages keep `skill:` links and show them as read-only chips with the same presentation; resource links remain navigable anchors.

`+` button: currently opens the file attachment picker. Future: add a reference option.

Drag-and-drop: deferred. Requires a broader unified-reference infrastructure where any plugin UI element can be marked as draggable, carrying a structured reference. The composer would receive the drop and insert a chip at the drop position. Native HTML5 drag-and-drop with a custom MIME type (`application/vnd.asterism.reference`) is the planned approach.

### User-typed references need no detection

Users can manually type `[label](resource:id/path)` — it is plain text, the model reads it as a markdown link, and the conversation view renders it through `MarkdownLink`. The `@` and `+` paths are convenience; they produce the same text the user could type by hand. No escaping protocol is needed for manually typed text because the model handles malformed links naturally.

Unsent drafts currently store text and re-parse reference links into chips; storing Tiptap document JSON for exact round-trip is planned. Sent messages store only text.

## Implemented

### SDK (`packages/sdk`)

- `resource-links.ts`: `resource:<id>/<path>`, each path segment percent-encoded.
- `skill-links.ts`: `skill:<name>` and `skill:<name>/<path>`, encoded per segment.

### Builtin (`packages/builtin`)

- `skills/contract.ts` / `skills/runtime.ts`: `SkillList` plugin call returning effective skill metadata.
- `reference-serialization.ts`: document ↔ text conversion and the `@` trigger prefix rule (Latin word characters block it; CJK text, spaces, punctuation and chips allow it).
- `reference-chip.tsx`: shared chip presentation for the composer and rendered messages.
- `reference-node.tsx`: inline atom node using the shared chip with a remove button; serializes as `[label](href)`.
- `reference-menu-model.ts`: pure category/view navigation and skill ranking.
- `reference-menu.tsx`: category drill-down menu above the composer with a virtualized list; reads the catalog on each opening; keyboard input is forwarded from the editor.
- `composer-editor.tsx`: Tiptap editor. `@tiptap/suggestion` owns the trigger range, dismissal and IME state; a lower-priority keymap submits on Enter through the form; Shift/Mod+Enter insert hard breaks. The draft text is the source of truth and external changes replace the document outside undo history. Dynamic placeholder, 100 000-character limit and `input-group-control` slot match the former textarea.
- `Composer.tsx` / `Conversation.tsx`: the composer ref is the editor handle.
- Tiptap dependencies are declared in `packages/builtin/package.json` at 3.32.2.

## Remaining work

- [ ] IME validation: Chinese input (candidate selection, Enter/Space/Backspace, typing beside chips, `@` during composition, undo, paste) on the target Electron/Chromium version.
- [ ] `+` button reference menu: a reference option beside the file attachment picker.
- [ ] Drag-and-drop insertion: a shared drag-source contract carrying a structured reference, and `handleDrop` in the editor.
- [ ] Draft JSON storage for exact chip round-trip in unsent drafts. Sent messages store text only.
- [ ] Resource reference browsing: directory resources are hierarchical; drag-and-drop from directory cards is the intended path.
