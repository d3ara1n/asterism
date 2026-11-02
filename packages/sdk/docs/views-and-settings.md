# Build views and settings

Views present state and accept input. Backend services own the work, results, and resource lifetime.

Application file services let views open resource FileRefs as byte streams and save a stream through the native Save As dialog. Pass a suggested filename and a lazy stream from the object's content reader or a file reference. Cancelling the dialog returns without reading the stream; ending the stream early abandons the transfer. Transfer failures preserve the old destination and surface as errors; views own their pending indicator and feedback. Previews and exports of captured content read the same immutable bytes.

## Present objects and operations

A resource card shows the object's content. A tool view shows one operation, including generated input, execution progress, and the final outcome.

Input previews can be incomplete. Displaying arguments does not establish that execution has begun. A final result should reflect what actually happened.

Use host presentation facilities for the surrounding card or operation. Keep domain content within the view rather than rebuilding application navigation and containment.

## Open expanded content

Resource card views can use the renderer island capability to open plugin content beside the workbench. The same entry works from a focused resource. Settings pages and expanded views open additional islands to their own right. Opening another island from the same source level replaces deeper content, subject to close guards.

Supply a plugin-local identity, accessible label, opening element, and content renderer. Choose a content surface for an editor or another view that needs more width. The host manages layout and focus. The opened view has an independent plugin region; pass its resource reference and other domain inputs explicitly rather than relying on the source component's React context or mount lifetime.

Use the island panel for its title, actions, and close control. Its fill layout lets an editor own scrolling. Mark unsaved content as dirty so closing, replacement, session navigation, and application exit ask before discarding it. A close guard can also retain a view while a save is pending. Closing the island releases its view calls without ending independent backend services.

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

## Start work from Home

A session entry supplies the complete starting interface for a plugin's workflow. It owns drafts, validation feedback, submission, and the initial title. Submit through a typed plugin call, prepare resources in the backend, and initialize the session atomically. Open the resulting session using the entry's host-provided callback.

Keep a retry identity until submission succeeds. Attachments travel through the call's content capability independently of its JSON input. The host handles entry selection and retains access to templates when no entry is available.

## Write interface text

Plain text is valid. Message declarations and translation catalogs support plugins that need localized interfaces.

Keep protocol identifiers, code, and raw diagnostics distinct from interface explanations. UI language changes should not reset drafts or running work.
