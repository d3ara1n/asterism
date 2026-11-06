# Application commands

The application command palette is an application-level interaction surface, independent of a particular Agent or resource card. It combines host operations and plugin contributions without giving the host knowledge of a plugin's paradigm. The application owns the modal, search, keyboard routing, grouping, page navigation, and focus restoration. Features own their commands and execution feedback.

## Ownership and grouping

Host features contribute their own groups directly. Each plugin contributes independent groups, displayed with the plugin's name and the group's label. Equal labels do not merge groups across sources. Command identity consists of the source, group, and path through sibling identities, rather than display text or array position.

A plugin command invokes ordinary plugin capabilities. The palette is not another backend dispatch protocol or an automatic-naming strategy registry. A session operation can be implemented by a plugin without belonging to an Agent card. The host supplies the current session context without interpreting the plugin's records or choosing an Agent on its behalf.

## Context and availability

A contribution reads the current session snapshot and session readiness. Outside a session, including application settings, the session context is absent. Conditions determine applicability: an inapplicable command is hidden, and a group with no applicable commands disappears. A transient inability to act keeps the command visible but disabled. A disabled parent page also disables its descendants; an inapplicable or removed parent no longer exposes its children.

Contributions are mounted while the palette is open and remain mounted across filtering and page navigation. Each plugin group receives its own frontend call scope and plugin preferences. Rendered command content stays in that same React subtree. Closing the palette releases those views and cancels their outstanding frontend calls. Application-owned services, such as update downloads, retain their own lifetimes and are not cancelled with the palette.

## Actions and nested pages

Each command executes an action or opens a nested list of commands. Entries have one activation target, not independently interactive controls inside selectable options. Supplementary content is read-only: status, progress, and errors can remain visible without introducing another focus or activation target.

An action decides when to close the palette. Pending state and failure feedback belong to the initiating feature, and pending prevents reentry at that entry rather than blocking unrelated commands. A saved choice has an explicit current marker, independent of the command highlighted for keyboard navigation. A nested page is named by its return control; it does not repeat the parent's group heading or supplementary content.

Search matches visible labels, group attribution, and declared aliases; internal identities are not search text. The command library scores and ranks matching results. Search is scoped to the current page, and navigation clears the query and navigation highlight. A fresh opening starts at the root.

Search receives initial focus and retains it during arrow-key navigation. Enter activates the highlighted command. The return control or Backspace with an empty query returns to the parent page; Escape closes the palette. Closing returns focus to the opener when it still exists.

## Keyboard scopes

The application palette uses the modifier beside Space with K: Command+K on macOS and Alt+K on Windows and Linux, where the Windows or Super key belongs to the system. It is also available from the application menu, which shows the platform's chord. Builtin's Agent palette uses Control+K on every platform, only within its Agent view. Application commands and Agent commands remain distinct even though they share command presentation and relevance matching.
