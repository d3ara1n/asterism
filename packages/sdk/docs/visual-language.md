# Fit plugin views into the workbench

A plugin's views appear beside the host's own and other plugins' views. Users read them as one application when they share its layering, the meaning of its lines and motion, and its controls for each kind of choice. This guide explains that visual language and the choices it implies for plugin authors. The shared controls carry the exact appearance; using them is how a plugin stays consistent as the application's styling evolves.

## Start from the host's containers

The host already draws the outer surface of every plugin view. A resource card has its shell and header, a settings page sits on the settings sheet, and an island opened through the SDK's island panel receives the shared title bar, toolbar slot, and content sheet. Put domain content inside these containers rather than drawing another card, header, or close control around it.

The island panel's title bar is where operations on the whole subject go: a primary action such as Save, and icon actions such as delete or restore defaults. Operations on one part of the content belong with that part, for example in a section header. A panel has no bottom action bar, because it is a non-modal workspace rather than a dialog.

## Separate regions by tone, not outlines

Inside a sheet, a region reads as a region because its tone differs, not because something draws around it. The design language has a small set of layers:

- **Shell**: titles, navigation, and toolbars sit on the shell tone.
- **Sheet**: reading and editing content sits on a raised sheet in the card tone.
- **Group**: rows, fields, and repeated items that belong together recede into a group in the shell tone, with hairlines between rows.
- **Floating**: menus, popovers, and dialogs lift above content and keep their outer edge.

A plugin that needs a group fills it with the shell tone token, `--card-shell`, and leaves out the border; the shared settings layout and list controls already follow this rule. Inside something that is already recessed, such as a tool's output in the conversation, a sub-panel rises back to the card tone instead of adding an outline. When two areas are already separated by tone, adding a border makes the view feel heavier and louder than the rest of the application.

## Use lines only when they mean something

Users learn that a line in Asterism tells them something: where focus is, what is selected, where a drop will land, or the state of a piece of work. A moving dashed outline means content is still forming, a still dashed outline means it ended incomplete, and a red line means the request that produced it failed. Hairlines between rows are the one structural line.

A plugin that draws decorative borders dilutes those meanings. Prefer the host's state presentation: tool views receive their state outline from the shared process block, and status uses the shared status badge, text, and icon components, which always pair color with an icon or label.

## Let motion explain a change

Motion in the workbench answers a question for the reader: where did this come from, where did it go, or what changed? Selection indicators travel to the new item, deeper pages enter from the side and leave the way they came, arriving content fades in while leaving content clears quickly, lists fold their height as items join or leave, and values animate only when they change.

Plugin views can use the host-provided Motion library for the same purposes, with the shared timing. Shared controls already carry their own motion; a segmented toggle's indicator, for example, slides without any plugin code. Avoid motion that decorates a static state, replays when an item merely scrolls into view, or competes with a list's own scrolling. Respect reduced motion, which the host's Motion configuration and CSS already follow.

## Choose controls by the kind of choice

The shared controls encode what a choice is, so the same kind of choice looks the same everywhere:

- A single choice among a few short options is a segmented toggle group.
- An immediate on/off setting is a switch; a choice inside a form or a multi-selection is a checkbox; an explained single choice is a radio group.
- A choice among many options, or one that needs search, uses the shared command and popover combination.
- Icon-only actions use the shared icon button, which supplies the accessible label and tooltip.
- Button variants carry roles: one default button for the primary action in a region, outline for supporting actions, ghost for compact and row actions, destructive for irreversible confirmation.

Building a lookalike control loses these meanings and the accessibility the shared one provides. Shared controls also follow the user's appearance settings for color, radius, density, and fonts without extra work.

## Render content through the shared readers

Markdown, code, diffs, math, diagrams, JSON, and resource or skill references have shared renderers. Using them means a plugin's output reads like every other plugin's output, including streaming behavior, copyable code, and reference navigation. Tool headers use the shared header with a subject, summary, and metadata, and long inputs use the header excerpt rather than a truncated title.

## Keep custom styling local

A plugin can style what is genuinely its own: a domain visualization, a canvas, a media viewer. Build that styling from the semantic color tokens and type roles so it follows the user's theme and both color schemes. CSS Modules keep plugin styles from leaking, while global styles share the document cascade with the host and every other plugin; avoid global selectors that would restyle shared controls or another plugin's views.

Check a view in light and dark modes, at each density, and with reduced motion before release. A typecheck cannot tell whether a view belongs in the workbench; looking at it beside the host's own views can.
