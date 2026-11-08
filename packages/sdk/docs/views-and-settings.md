# Build views and settings

Views present state and accept input. Backend services own the work, results, and resource lifetime.

Application file services let views open resource FileRefs as byte streams and save a stream through the native Save As dialog. Pass a suggested filename and a lazy stream from the object's content reader or a file reference. Cancelling the dialog returns without reading the stream; ending the stream early abandons the transfer. Transfer failures preserve the old destination and surface as errors; views own their pending indicator and feedback. Previews and exports of captured content read the same immutable bytes.

## Present objects and operations

A resource card shows the object's content. A tool view shows one operation, including generated input, execution progress, and the final outcome.

Input previews can be incomplete. Displaying arguments does not establish that execution has begun. A final result should reflect what actually happened.

Use host presentation facilities for the surrounding card or operation. Keep domain content within the view rather than rebuilding application navigation and containment.

## Open expanded content

Resource card views, settings pages, and islands can use the renderer island capability to open plugin content. Islands open at the right end of the screen and belong to the island that opened them; closing an island closes the islands it opened. Opening a key that is already open locates that island and keeps its content and ownership, so the key decides between one shared island and separate ones. Keys are unique within a screen and isolated by plugin identity; include resource, session, or parent context when distinct editors need separate keys. `has(key)` reports whether a key is open, for example to mark the selected row. The host owns ordering, sizing, and the island menu.

Supply a plugin-local lookup key, accessible label, opening element, and content renderer. Choose a content surface for an editor or another view that needs more width. The host manages layout and focus. The opened view has an independent plugin region; pass its resource reference and other domain inputs explicitly rather than relying on the source component's React context or mount lifetime.

For a settings editor that creates an entry and remains open for editing, bind its content key with `useRendererIslandKey`. Derive the key from the editor's current persisted identity: use a distinct creation key before the first save, then update the identity and normalized draft from the successful save result. The hook binds the new key in place, releasing the creation key so another blank editor can open. Derive it from saved identity rather than unsaved ID input; a successful rename uses the same mechanism. Keep creation and saved-object keys disjoint, including for objects named `new`.

The island instance remains mounted with its position, width, focus, scroll, guards, and children intact. Only content lookup changes. An occupied target key is reported by the host and leaves both islands unchanged; a successful save is not rolled back or retried as creation. Imperative `bindKey` reports whether binding succeeded and applies only to ordinary islands opened by the same plugin, not an enclosing host-managed island. A key binding does not change a resource island's saved navigation destination.

Escape is not a general island close shortcut. For a cancellable task, its island owner declares one action with `useRendererIslandCancel`; pass null when the task has no cancellation action. Local controls handle Escape first, and an island without an action does not pass cancellation to its opening island. The callback owns the outcome: to dismiss the task, call the island's normal close operation so unsaved-change guards still apply. Functional windows and the shared panel frame do not declare cancellation automatically.

Use the island panel for its title, actions, and close control. Its fill layout lets an editor own scrolling. Mark unsaved content as dirty so closing, closure through the opening island, session navigation, and application exit ask before discarding it. A close guard can also retain a view while a save is pending. Closing the island releases its view calls without ending independent backend services.

## Open resource locations

A resource type can declare `open(location, context)` in its renderer resource description. The location is an opaque string interpreted by that resource. A file resource can open an editor or read-only viewer; a browser resource can navigate to a URL. The handler receives the resolved resource reference, typed calls, the opening element, and an island capability bound to the target plugin. It returns whether the open completed. The first island a handler opens for a navigation is restorable: the host saves the resource and location and calls the handler again to rebuild that island when the session reopens, so the handler should derive the island from the location alone.

Use `useRendererResourceNavigation().open(resource, location, { origin })` from a card, settings page, Home entry, or island. Supply the session ID and resource ID. The host resolves current resource presence and invokes its registered handler. It reports missing resources, unsupported opening, and handler failures. User and plugin navigation are independent of model-request authorization and directed resource links.

Resources own the meaning of their locations and their content surfaces. A filename remains a file location; opening it does not turn its contents into application navigation or grant embedded text another interaction contract. Directory files use editable text and image surfaces, while manual files use read-only text and image surfaces.

A reference URL is a string that names something to act on: `resource:<encoded resource ID>/<location>` addresses a resource location, and `skill:<encoded name>[/<package path>]` addresses a skill in the Agent skill catalog. Location segments are percent-encoded individually and keep `/` as a separator. `resourceUrl`, `skillUrl`, and their `parse*` counterparts build and read them; `referenceMarkdown(label, url)` writes the Markdown link form. A reference URL is only text: it can name a resource that is absent, removed, or not linked to anyone, and following it reports what it finds at that time. A displaying interface supplies the session identity when following a resource URL. The Agent Markdown interface recognizes both schemes.

Any view can start a reference drag. In `dragstart`, call `setReferenceDrag(event.dataTransfer, text)` with reference text, usually one or more `referenceMarkdown` links. The drag carries only the `application/vnd.asterism.reference` type, so surfaces that do not read references, including the canvas, ignore it. Targets check `hasReferenceDrag` during `dragover` and read the text with `readReferenceDrag` on `drop`. The Agent composer inserts dropped reference text at the drop point, where resource and skill links become chips.

## Style plugin views

Import CSS from the renderer entry or its components. Asterism builds the imported styles and loads them before frontend preparation and view registration. CSS references to bundled images and fonts keep their relative paths. Style loading failures appear as frontend plugin failures.

Use CSS Modules (`.module.css`) for component-local class names, importing the generated names into the component. Plain CSS shares the application's document, so global selectors and resets affect other views. Host theme variables can supply colors and spacing without redefining the application theme.

Tailwind and other preprocessors belong to the plugin's build setup. Generate ordinary CSS and import that output; the host does not process the plugin's Tailwind or PostCSS configuration. Utility classes used only by an external plugin need its own generated CSS.

Styles remain loaded while the plugin frontend is active, including when individual cards unmount. Failed initialization releases that plugin's stylesheet; ending the frontend lifetime releases all loaded plugin styles.

## Add settings

A plugin can declare several settings pages independently of sessions and resources. Each has its own identity, title, summary, optional icon, and body. The icon is a component the host draws at its own size and color; the host draws the card, page heading, and attribution, and the plugin supplies only the body. Entries appear on settings home with the contributing plugin's display name. Plugin management is a separate list for installation and enablement.

The page owns its edit drafts and pending interactions; the plugin service owns shared configuration. Navigation targets a plugin and page, with an optional declared location inside the page. A page failure is isolated and can be retried without disabling other settings pages.

Managed configuration suits schema-validated settings. Other plugin data can use a storage model appropriate to its purpose.

Closing a page releases its view subscriptions. It does not end every service the plugin uses.

## Contribute application commands

Declare command groups in the renderer plugin's `commands` field. The application palette displays each group as **Plugin name · Group**, keeping groups separate even when different plugins use the same label. Group IDs are local to the plugin; command IDs are local to the group.

Each group's `useCommands(context)` is a React hook, mounted in that plugin's calls and preferences scope while the palette is open. Call hooks unconditionally, then use `when: false` to hide commands that do not apply. `disabled: true` keeps an unavailable command visible. The context supplies the current session snapshot, or null outside a session, and whether that session is ready for operations. A session command can hide when no session exists and disable while it is not ready.

An action uses `onAction`; it decides when to dismiss the palette through `context.close()`. For asynchronous work, retain pending and failure state in the hook, disable reentry, show feedback in `detail`, and close after success. Invoke backend work through ordinary typed plugin calls, passing session identity explicitly when needed. Renderer commands need no separate backend registry.

A control uses `control` instead of `onAction`. It is a real interactive child, such as an input, switch, or select, rather than an action row that activates around it. Its component owns its interaction and may use plugin-scoped hooks. Compose controls from the plugin's own UI components; the command contract does not require a UI library.

For example, a plugin can combine a persistent preference control with a reset action:

```tsx
import { useState } from "react";
import { z } from "zod";
import {
  defineRendererPlugin, useRendererPreferences,
  type RendererCommandGroup,
} from "@asterism-app/sdk/renderer";

function CompactRows() {
  const preferences = useRendererPreferences();
  const [compact, setCompact] = useState(
    () => preferences.get("compactRows", z.boolean()) ?? false,
  );
  return <input type="checkbox" aria-label="Compact rows" checked={compact}
    onChange={event => {
      const next = event.currentTarget.checked;
      preferences.set("compactRows", next);
      setCompact(next);
    }} />;
}

const appearance: RendererCommandGroup = {
  id: "appearance", label: "Appearance",
  useCommands({ close }) {
    const preferences = useRendererPreferences();
    return [
      { id: "compact", label: "Compact rows", control: <CompactRows /> },
      {
        id: "reset", label: "Reset row spacing",
        onAction() {
          preferences.set("compactRows", null);
          close();
        },
      },
    ];
  },
};

export default defineRendererPlugin({ commands: [appearance] });
```

## Start work from Home

A session entry supplies the complete starting interface for a plugin's workflow. It owns drafts, validation feedback, submission, and the initial title. Submit through a typed plugin call, prepare resources in the backend, and initialize the session atomically. Open the resulting session using the entry's host-provided callback.

Keep a retry identity until submission succeeds. Attachments travel through the call's content capability independently of its JSON input. The host handles entry selection and retains access to templates when no entry is available.

## Write interface text

Plain text is valid. Message declarations and translation catalogs support plugins that need localized interfaces.

Keep protocol identifiers, code, and raw diagnostics distinct from interface explanations. UI language changes should not reset drafts or running work.
