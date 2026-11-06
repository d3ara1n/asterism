# Application commands

The application command palette is an application-level interaction surface, independent of a particular Agent or resource card. It combines host operations and plugin contributions without giving the host knowledge of a plugin's paradigm. The application owns the modal, search, keyboard routing, grouping, and focus restoration. Features own their commands and execution feedback.

## Ownership and grouping

Host features contribute their own groups directly. Each plugin contributes independent groups, displayed with the plugin's name and the group's label. Equal labels do not merge groups across sources. Identity consists of the source, group, and command, rather than display text or array position.

A plugin command invokes ordinary plugin capabilities. The palette is not another backend dispatch protocol or an automatic-naming strategy registry. A session operation can be implemented by a plugin without belonging to an Agent card. The host supplies the current session context without interpreting the plugin's records or choosing an Agent on its behalf.

## Context and availability

A contribution reads the current session snapshot and session readiness. Outside a session, including application settings, the session context is absent. Conditions determine applicability: an inapplicable command is hidden, and a group with no applicable commands disappears. A transient inability to act keeps the command visible but disabled.

Contributions are mounted while the palette is open. Each plugin group receives its own frontend call scope and plugin preferences. Closing the palette releases those views and cancels their outstanding frontend calls. Application-owned services, such as update downloads, retain their own lifetimes and are not cancelled with the palette.

## Actions and controls

Commands may execute an action or contain an interactive control. An action decides when to close the palette; asynchronous success need not dismiss it immediately. Pending state and failure feedback belong to the initiating feature, and pending prevents reentry at that entry rather than blocking unrelated commands.

An inline control remains a real control. Its pointer, keyboard, disabled, and accessible-name behavior must not be replaced by a selectable menu option. The palette uses an interactive grid rather than nesting buttons inside listbox options. Search matches visible labels, group attribution, and declared aliases; internal identities are not search text.

Search receives initial focus. Arrow keys enter the result rows; Enter executes the first available result or enters its control. The grid owns row navigation, and Tab enters a row's controls so those controls retain their own keyboard behavior. Closing returns focus to the opener when it still exists.

## Keyboard scopes

The application palette uses the modifier beside Space with K: Command+K on macOS and Alt+K on Windows and Linux, where the Windows or Super key belongs to the system. It is also available from the application menu, which shows the platform's chord. Builtin's Agent palette uses Control+K on every platform, only within its Agent view. Application commands and Agent commands remain distinct even when both surfaces use search and grouping.
