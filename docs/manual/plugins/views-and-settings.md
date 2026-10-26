# Build views and settings

Views present state and accept input. Backend services own the work, results, and resource lifetime.

## Present objects and operations

A resource card shows the object's content. A tool view shows one operation, including generated input, execution progress, and the final outcome.

Input previews can be incomplete. Displaying arguments does not establish that execution has begun. A final result should reflect what actually happened.

Use host presentation facilities for the surrounding card or operation. Keep domain content within the view rather than rebuilding application navigation and containment.

## Add settings

A plugin can have a settings page independently of sessions and resources. The page owns its edit drafts and pending interactions; the plugin service owns shared configuration.

Managed configuration suits schema-validated settings. Other plugin data can use a storage model appropriate to its purpose.

Closing a page releases its view subscriptions. It does not end every service the plugin uses.

## Extend Agent interaction

Agent UI extensions can add compact controls, supplemental content, or modal interaction. Their business state remains owned by the contributing plugin.

A component becoming invisible does not mean a waiting tool has completed or been cancelled. Reopening a view should reflect the current business state.

## Write interface text

Plain text is valid. Message declarations and translation catalogs support plugins that need localized interfaces.

Keep protocol identifiers, code, and raw diagnostics distinct from interface explanations. UI language changes should not reset drafts or running work.
