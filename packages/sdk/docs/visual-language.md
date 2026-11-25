# Fit plugin views into the workbench

A plugin's views appear beside the host's own and other plugins' views. The SDK provides Asterism-specific ways to register tool and card views, open islands, and use workbench navigation. Within those views, you choose the controls.

Choose controls that meet your view's requirements. You can use a third-party library, write your own controls, or use the SDK's shared controls. When an SDK control fits and you want the same appearance and interaction as the workbench, it saves you that work. If it doesn't fit, use another control without cutting features to match the SDK. You can mix these choices in the same view.

## Start from the host's containers

The host already draws the outer surface of every plugin view. A resource card has its shell and header, a settings page sits on the settings sheet, and an island opened through the SDK's island panel receives the shared title bar, toolbar slot, and content sheet. Put domain content inside these containers rather than drawing another card, header, or close control around it.

The island panel's title bar is where operations on the whole subject go: a primary action such as Save, and icon actions such as delete or restore defaults. Operations on one part of the content belong with that part, for example in a section header. A panel has no bottom action bar, because it is a non-modal workspace rather than a dialog.

## Separate regions by tone, not outlines

Inside a sheet, a region reads as a region because its tone differs, not because something draws around it. The design language has a small set of layers:

- **Shell**: titles, navigation, and toolbars sit on the shell tone.
- **Sheet**: reading and editing content sits on a raised sheet in the card tone.
- **Group**: rows, fields, and repeated items that belong together recede into a group in the shell tone, with hairlines between rows.
- **Floating**: menus, popovers, tooltips, hover cards, and dialogs lift above content and keep their outer edge.

A plugin that needs a group uses the shell tone rather than adding a border; the shared settings layout and list controls already follow this rule. Inside something that is already recessed, such as a tool's output in the conversation, a sub-panel rises back to the card tone instead of adding an outline. When two areas are already separated by tone, adding a border makes the view feel heavier and louder than the rest of the application.

## Use lines only when they mean something

Users learn that a line in Asterism tells them something: where focus is, what is selected, where a drop will land, or the state of a piece of work. A moving dashed outline means content is still forming, a still dashed outline means it ended incomplete, and a red line means the request that produced it failed. Hairlines between rows are the one structural line.

Tool views receive their state outline from the host's process block. When showing status within your own content, pair color with an icon or label rather than relying on color alone.

## Let motion explain a change

Motion in the workbench answers a question for the reader: where did this come from, where did it go, or what changed? Selection indicators travel to the new item, deeper pages enter from the side and leave the way they came, arriving content fades in while leaving content clears quickly, lists fold their height as items join or leave, and values animate only when they change.

Plugin views should use the same motion cues and timing. Shared controls already carry their own motion; a segmented toggle's indicator, for example, slides without any plugin code. Avoid motion that decorates a static state, replays when an item merely scrolls into view, or competes with a list's own scrolling. Respect reduced motion in custom transitions as well.

## Choose controls by the kind of choice

Use the same interaction for the same kind of choice, whichever library supplies the controls:

- A single choice among a few short options is a segmented toggle group.
- An immediate on/off setting is a switch; a choice inside a form or a multi-selection is a checkbox; an explained single choice is a radio group.
- A choice among many options, or one that needs search, uses a searchable picker in a popover.
- Icon-only actions have an accessible label and a tooltip.
- A short name or explanation on hover is a tooltip; a preview read while hovering is a hover card; content the user opens on purpose, scrolls, or acts on is a popover behind a button.
- Button variants carry roles: one default button for the primary action in a region, outline for supporting actions, ghost for compact and row actions, destructive for irreversible confirmation.

Tooltips share the popover tone. Keep their delay, placement, and width consistent. If a tooltip explains why an action is unavailable, make the explanation reachable even when the control is disabled.

## Use shared readers when they fit

The host supplies optional presentation controls through the SDK renderer. Tool titles can use `ToolHeader` with a subject, summary, and metadata. `ToolResourceSubject` puts the resource recorded with the call in the subject slot, and `HeaderExcerpt` shortens long inputs without truncating the operation name. `ToolScrollArea` provides a default height for settled results; `StreamingScrollArea` follows growing content. A view can use its own layout when those defaults do not fit.

`Diff` renders a unified diff of one file. Set wrapping or word-level change highlighting as needed, and turn line numbers off when hunk positions are not real file positions. The view owns its toolbar, preferences, and scroll layout. A plugin can also use its own diff viewer or other controls without changing how it connects to islands, cards, or tool views.

## Keep custom styling local

For third-party or custom controls, use the workbench's semantic color tokens and type roles when you want the view to follow the user's theme in both color schemes. CSS Modules keep plugin styles local, while global styles share the document cascade with the host and every other plugin. Avoid global selectors that would restyle shared controls or another plugin's views.

Check a view in light and dark modes, at each density, and with reduced motion before release. A typecheck cannot tell whether a view belongs in the workbench; looking at it beside the host's own views can.
