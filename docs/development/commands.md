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

Search owns focus during keyboard navigation. Closing returns focus to the opener when it still exists.

## Keyboard scopes

The host owns the application palette shortcut and shows the platform binding in the application menu. Its modifier differs by platform because Windows and Linux reserve the Windows or Super key for the system. Builtin owns the Agent palette shortcut and handles it only within the focused Agent view. The two scopes remain distinct even though they share command presentation and relevance matching.
