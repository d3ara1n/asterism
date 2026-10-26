# Design system

The native window is the material base. Independent opaque content surfaces sit above it. Shared tokens and controls keep application and built-in plugin views consistent.

## Color and surfaces

Use semantic tokens from the theme implementation. The chosen accent expresses primary actions, active work, and persistent selection; the gray palette expresses ordinary labels and secondary surfaces.

| Token family | Meaning |
| --- | --- |
| `primary` and its foreground | Solid primary actions |
| `primary-text` | Accent text and icons on ordinary surfaces |
| `secondary` | Neutral secondary surfaces |
| `selected` | Persistent navigation or list selection |
| `accent` | Temporary hover and keyboard highlight |
| `muted` | Subdued regions and supporting text |
| `external-message` | Incoming Agent messages |
| `success`, `warning`, `destructive` | Fixed semantic status colors |
| `background` | Page and control backgrounds |
| `canvas` | Workbench backing surfaces |

Pair colored surfaces with their corresponding foreground token. Contrast requirements apply in both schemes. Graphite derives emphasis from the chosen gray palette rather than a separate chromatic accent.

`surface` is the ordinary bordered card surface; `surface-floating` adds the shared shadow for floating content. Menus and dialogs use their public control surfaces.

Theme values, palette ordering, radii, density, and font settings have shared definitions. Components do not duplicate those values.

## Native windows

macOS uses native controls and under-window vibrancy. Supported Windows uses Acrylic and controls overlay, with a solid fallback. Linux defaults to controls overlay with a solid background and supports native titlebar mode.

Theme and reduced-transparency/high-contrast behavior originate in main. Keep the root transparent to the native material while content surfaces remain readable. CSS backdrop blur does not replace native window material.

Window state supplies the titlebar mode and native fullscreen state. Fullscreen removes controls-specific space; maximization retains it. Windows and Linux use the actual controls-overlay safe region rather than permanently assuming a fixed button width.

Window gaps are draggable. Interactive surfaces explicitly exclude dragging, while descendant drag-region reset prevents transformed canvas descendants from creating oversized exclusion areas.

The Linux native-titlebar switch is resolved when creating the window and requires restart. It does not change the other platforms’ titlebar policy.

## Screens and islands

Window owns titlebar and managed space. Screens move within that space; islands are columns within a screen. Descendants do not independently compensate for the titlebar.

Settings sits to the left of the main screen. The sidebar and focused object are controlled leading islands; Home or the workbench is the main root island. Navigation moves screens explicitly rather than intercepting system gestures.

Islands declare minimum width, growth weight, and optional maximum. When they fit, distribute space and center them. When they overflow, use minimum widths and reveal the focused island. Segment navigation makes completely displaced islands reachable.

A child opens to its parent’s right and replaces deeper children. Escape closes the focused eligible child and restores its opener. Host-owned borders and focus highlights remain outside clipped content.

Feature code requests island operations through the shared interface. Layout calculations remain independent of business components.

## Motion

Use Motion for presence, layout changes, and shared elements. Public motion tokens own timing and curves. Respect reduced motion in both Motion and CSS.

Home/workbench transitions retain the same workbench backing container while content loads. Initial Home display does not play a navigation entrance.

Streaming Markdown uses the renderer library’s own pacing. Virtual lists own item measurement and positioning; disclosure transitions animate content without adding a second layout or scroll compensation system.

History remounts render statically. Interaction transitions do not replay merely because an item scrolled into view.

## Cards, tools, and reading

All object cards use the shared header and `ObjectSurface`. Resource geometry supplies default and minimum sizes. Resizing changes the content area, not typography or control size.

Auxiliary panels respond to card width rather than window width or canvas zoom. The host owns their title, close action, and containment.

Tool headers form single-line summaries with a shrinkable target area and stable trailing statistics. Preserve meaningful information across input, execution, and result phases.

The tool shell does not impose one global body height. Renderers choose local scroll or preview behavior. Built-in code and diff views use Pierre Diffs; Markdown uses the shared renderer. Full saved data remains distinct from presentation budgets.

Shared streaming previews have bounded tail views and are noninteractive. Final results switch to the appropriate full reading view.

User input and external Agent messages differ through placement, labels, and icons as well as color. Process summaries and compaction markers use the common Marker presentation.

## Controls and feedback

Use shadcn/Radix controls and shared combinations in `packages/ui/src/ui/`. Feature code does not create parallel button, select, border, or shadow styles.

| Button variant | Role |
| --- | --- |
| Default | Primary action within its region |
| Outline | Supporting actions and recovery |
| Ghost | Navigation, row actions, compact controls |
| Secondary | Neutral secondary action |
| Selected | Current navigation or opened item |
| Destructive | Irreversible confirmation |
| Link | An action embedded in text |

Icon-only actions use the shared accessible tooltip control. Destructive entry points and their confirmation remain distinct.

Status uses shared status components with text and icons. Field errors stay with fields; command progress stays at its entry; persistent failures use local alerts; transient feedback uses notifications.

A workbench reread does not become a global saving badge or block ordinary interaction.

## Typography, charts, and editors

Use the shared display, page, section, body, caption, label, and code roles. UI and code fonts have separate tokens. Read-only count abbreviations use the common formatter; editable and raw values remain complete.

Use Lucide icons. Chart category colors are independent of status and accent colors. Pair each graphic with visible labels and values; colors alone do not encode meaning.

Switches express immediate booleans, checkboxes express form or multi-selection, radios express explained single choices, tabs change content, and searchable choices use the shared command/popover combination.

List rows keep one hit surface with separate actions. Editors group related fields and operations in shared sections and expose reset where values override their baseline.

## Branding and implementation ownership

The approved brand direction is a three-star arrangement. Formal logo design is deferred. Existing interface marks and application icons remain placeholders.

Icon geometry and colors have one generating source; platform assets are generated from it. Packaging uses committed assets rather than requiring local generation tools.

Shared control semantics belong to `packages/ui/`; window behavior belongs to main and Window; layout belongs to weave; UI messages belong to the relevant app or plugin.

Visual changes require manual acceptance on the actual platform. Necessary typechecks and builds support that acceptance; they do not establish appearance.
