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
| `event-message` | Resource event messages |
| `success`, `warning`, `destructive` | Fixed semantic status colors |
| `background` | Page and control backgrounds |
| `canvas` | Workbench backing surfaces |
| `folder-*` | Decorative folder identity: dots and preview tints |

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

Settings sits to the left of the main page. The main page lays out the navigation sidebar, a central Island viewport, and an optional auxiliary panel as neighboring regions. Sidebars stay docked within the page while visible and reserve width from the central viewport; users hide or close them explicitly. Home or the workbench is the central root Island. Navigation switches whole pages, including their sidebars, rather than intercepting system gestures.

Islands declare minimum width, growth weight, and optional maximum. When they fit, distribute space and center them. When they overflow, use minimum widths and reveal the focused island within the Island viewport without moving the docked sidebars. Segment navigation makes completely displaced islands reachable.

An ordinary island opens at the right end of the screen and belongs to the island that opened it; closing an island also closes the islands it opened. Escape invokes only an explicitly declared cancellation action on the focused island; closing capability does not imply cancellation. Local controls handle Escape first, and an island without a cancellation action does not delegate it to its owner. Closing restores the opener when available. Host-owned borders and focus highlights remain outside clipped content.

Page-region cleanup releases only island instances opened by that region. Rebinding an editor from a creation key to its saved-object key preserves the instance, arrangement, focus, and ownership. Sharing a containing island does not make another region's islands part of its lifetime.

An island shell's border, clipping, and focus highlight are independent of its background fill. Content that paints its own background, such as the canvas, uses a transparent shell so entry and exit animations reveal the native window material rather than an unrelated card fill.

Feature code requests island operations through the shared interface. Layout calculations remain independent of business components.

## Motion

Use Motion for presence, layout changes, and shared elements. Public motion tokens own timing and curves. Respect reduced motion in both Motion and CSS.

Home/workbench transitions retain the same workbench backing container while content loads. Initial Home display does not play a navigation entrance.

Streaming Markdown uses the renderer library’s own pacing. Virtual lists own item measurement and positioning; disclosure transitions animate content without adding a second layout or scroll compensation system.

History remounts render statically. Interaction transitions do not replay merely because an item scrolled into view.

## Cards, tools, and reading

All object cards use the shared header and `ObjectSurface`. Resource geometry supplies default and minimum sizes. Resizing changes the content area, not typography or control size.

Auxiliary panels respond to card width rather than window width or canvas zoom. The host owns their title, close action, and containment.

Tool headers form single-line summaries with an operation name and three optional rich-content areas: subject, summary, and metadata. The operation name uses normal foreground emphasis. Subjects use a low-emphasis badge; summaries use muted text at the normal header size; trailing metadata uses muted caption text. Subjects and summaries yield space while trailing metadata remains visible. Preserve meaningful information across input, execution, and result phases.

These areas provide presentation defaults, not restrictions on content or a required decomposition. Renderers may use text, icons, or composed content in any area, including placing all content in the summary. Local typography and semantic state colors remain available. The subject identifies the focus of the operation: resource creation and creation-entry inspection use the resource type, with an instance title in the summary when available. Inspection and operations on an existing resource use its recorded name and an available kind icon; inspection places the resource type in metadata, while operations place paths, queries, or other details in the summary. Separate areas replace punctuation used only to join an object and its details. The shell presents exceptional call outcomes independently of the content areas.

The tool shell does not impose one global body height. Renderers choose local scroll or preview behavior. Code and diff views use the shared Pierre Diffs presentation in `packages/ui/`, available to every plugin. Markdown and reference chips also live there: every plugin renders Markdown, streaming output, footnotes, code, math, diagrams, and skill or resource links through the same control. The control relies on the host's `.markdown-content` and KaTeX styles. Full saved data remains distinct from presentation budgets.

Shared streaming previews have bounded tail views and are noninteractive. Final results switch to the appropriate full reading view.

User, Agent, and resource event messages share body rendering. Source presentation has one definition across conversation headers, drafts, history, and navigation previews. Incoming Agent messages use the recorded Agent name and any name disambiguator; event messages use the recorded resource name and event label. Placement, labels, and icons distinguish sources alongside color. Process summaries and compaction markers use the common Marker presentation.

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

Every size-adjustment handle supports double-clicking to restore the affected surface's default geometry. Reset clears the user size override and uses the current default, subject to the surface's minimum and maximum dimensions. Handle hints describe both dragging and double-click reset. An explicit reset action also remains available through a keyboard-accessible control or menu.

Status uses shared status components with text and icons. Feedback stays with the operation it belongs to: field errors stay with fields, command progress stays at its entry, and Agent execution errors and warnings stay inline in the owning conversation. Independent interface command failures use toast notifications. Diagnostic origin and transient lifetime do not determine placement; one execution failure is not repeated as both an inline alert and a toast.

A workbench reread does not become a global saving badge or block ordinary interaction.

## Typography, charts, and editors

Use the shared display, page, section, body, caption, label, and code roles. Interface, terminal, and code fonts have independent settings. Code and terminal sizes accept pixel values from 1 to 100 with up to two decimal places in a single compact field with keyboard stepping and a reset action that appears once the value differs from its baseline. Automatic code sizing inherits the surrounding text and appears as placeholder text; clearing or resetting the code size restores it. Terminal size is independent of interface density and resets to 12 pixels. Read-only count abbreviations use the common formatter; editable and raw values remain complete.

The host publishes typography through root CSS tokens. Plugin DOM content inherits those styles; renderers that require explicit font options consume the resolved tokens and apply changes to existing views. Interactive terminals and terminal images use the same font settings. Font changes recalculate terminal geometry without restarting the shell.

Use Lucide icons. Chart category colors and folder colors are independent of status and accent colors. Pair each graphic with visible labels and values; colors alone do not encode meaning, so a folder color always appears with its folder name, either visibly or, for compact membership marks in a list, through a tooltip and the row's accessible name.

Switches express immediate booleans, checkboxes express form or multi-selection, radios express explained single choices, tabs change content, and searchable choices use the shared command/popover combination.

A two-state menu item is one checkbox item. Its identity icon sits in the shared leading column, a trailing switch-shaped indicator shows the state, and the label names the state rather than an action. Icon and label stay fixed across states, and the row contains no separately interactive control.

List rows keep one hit surface with separate actions. Editors group related fields and operations in shared sections and expose reset where values override their baseline.

## Branding and implementation ownership

The approved brand direction is a three-star arrangement. Formal logo design is deferred. Existing interface marks and application icons remain placeholders.

Icon geometry and colors have one generating source; platform assets are generated from it. Packaging uses committed assets rather than requiring local generation tools.

Shared control semantics belong to `packages/ui/`; window behavior belongs to main and Window; layout belongs to weave; UI messages belong to the relevant app or plugin.

Visual changes require manual acceptance on the actual platform. Necessary typechecks and builds support that acceptance; they do not establish appearance.
