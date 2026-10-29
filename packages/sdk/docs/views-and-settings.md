# Build views and settings

Views present state and accept input. Backend services own the work, results, and resource lifetime.

## Present objects and operations

A resource card shows the object's content. A tool view shows one operation, including generated input, execution progress, and the final outcome.

Input previews can be incomplete. Displaying arguments does not establish that execution has begun. A final result should reflect what actually happened.

Use host presentation facilities for the surrounding card or operation. Keep domain content within the view rather than rebuilding application navigation and containment.

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
