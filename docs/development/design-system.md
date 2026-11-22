# Design system

Asterism presents many plugins' work inside one workbench. The design system keeps that work reading as one application: the same layering, the same meaning for lines and motion, and the same controls for the same kinds of choice. This document records the language, its foundations, the patterns that apply it, and where each part is implemented. Exact values live in the theme, stylesheet, and shared controls; this document explains what they mean and how to choose among them.

## Design language

The native window material is the base. Opaque content surfaces sit above it, and everything inside them follows four principles.

**Tone and depth form regions.** A shell holds titles, navigation, and toolbars. Reading and editing content sits on a raised sheet inside the shell. Within a sheet, groups of rows and process blocks recede back to the shell tone. Floating elements lift above everything with a shared shadow. Each layer has its own tone, shadow, and radius, so a region is recognizable without an outline around it.

**Lines carry meaning.** A line tells the reader something: where focus is, what is selected, where a drop lands, or the state of a piece of work. Hairlines separate consecutive rows inside a group, and an outer shell keeps its border as the edge against the window material. A border never separates two regions that tone already separates. Because lines are rare, the ones that remain are noticed.

**Motion explains cause and continuity.** Movement shows where something came from, where it went, or that a value changed. A small vocabulary covers these meanings; motion that expresses none of them is omitted, and motion never decorates a static state.

**Restraint over effects.** Shading stays restrained. A treatment that does not stand on its own is not compensated with more effects, gradients, or animation.

When a new surface is designed, decide in this order: which layer the content belongs to, whether any line is needed and what it means, and only then whether a change deserves motion. Most questions resolve at the first step.

## Foundations

### Color

Semantic tokens from the theme carry all color. The chosen accent expresses primary actions, active work, and persistent selection; the gray palette expresses ordinary labels and surfaces. Graphite derives emphasis from the gray palette instead of a separate chromatic accent.

| Token family | Meaning |
| --- | --- |
| `primary` and its foreground | Solid primary actions |
| `primary-text` | Accent text and icons on ordinary surfaces |
| `secondary` | Neutral secondary fills, such as chips and supported-capability marks |
| `selected` | Persistent navigation or list selection |
| `accent` | Temporary hover and keyboard highlight |
| `muted` | Recessed tracks, placeholders, and supporting text |
| `card-shell`, `card` | The shell tone and the sheet tone |
| `external-message`, `event-message` | Incoming Agent messages and resource event messages |
| `success`, `warning`, `destructive` | Fixed semantic status colors |
| `background` | Control backgrounds |
| `canvas` | Workbench backing surfaces |
| `folder-*`, `chart-*` | Decorative folder identity and chart categories, independent of status and accent |

Colored surfaces pair with their foreground token, and contrast holds in both schemes. Color never encodes meaning alone: status pairs with an icon or label, and a folder color appears with its name, visibly or through a tooltip and accessible name.

### Layers

| Layer | Tone and depth | Holds |
| --- | --- | --- |
| Window material | Native vibrancy, Acrylic, or a solid fallback | Page backgrounds, gaps between surfaces |
| Shell | `card-shell` with a border against the material | Titles, navigation, toolbars, the composer and entry trays |
| Sheet | `card`, raised by the sheet shadow, no border | Reading and editing content inside a shell |
| Group | Shell tone recessed on a sheet, no border | Grouped rows, fields, empty states, process blocks |
| Floating | Popover tone with the floating or lift shadow | Menus, popovers, tooltips, hover cards, dialogs, toasts, trays that float over content |

Islands, docks, and object cards are shells. The shared panel and the object surface supply their sheet, so plugin islands opened through the shared panel inherit the layering. Cards placed directly on the window material, such as template cards and usage panels, keep the shell border and hold a sheet inside. Embedded inside another sheet, the same panel drops its border and reads as a group. Panels and fields inside a group rise back to the sheet tone rather than adding outlines. Floating surfaces keep their outer edge and shadow because they cover arbitrary content; inside them, header, body, and footer separate by spacing and tone rather than rules.

The stylesheet expresses these layers as `surface` (a bordered shell or card), `surface-floating`, `surface-inset` (a sheet), `surface-group`, and `surface-block` (a process block), together with tokens for the sheet shadow, the lift shadow, and the nested inset radius.

### Shape

One radius setting drives every corner. A sheet nests concentrically inside its shell: its radius is the shell radius minus the 4px inset and the shell border, which the inset radius token expresses. Content floating inside a shell farther from the edge than its own radius, such as the composer tray, matches the container radius instead of shrinking toward a square corner. Feature code does not compute its own nested radii or define its own shadows.

### Typography, icons, and density

Text uses the shared display, page, section, body, caption, label, and code roles. Interface, terminal, and code fonts are independent settings; code text inherits the surrounding size unless the user sets one, and terminal size is independent of interface density. The host publishes typography as root tokens that plugin content inherits; renderers that need explicit font options read the resolved tokens and follow later changes. Interactive terminals and terminal images use the same font settings, and a font change recalculates terminal geometry without restarting the shell.

Density scales the root size, so spacing and type scale together without component changes. Resizing a card or island changes its content area, never its typography or control size.

Icons come from Lucide. Read-only abbreviated counts use the common formatter; editable and raw values stay complete.

### Native windows

macOS uses native controls and under-window vibrancy. Supported Windows versions use Acrylic with a controls overlay and a solid fallback. Linux defaults to a controls overlay on a solid background and offers a native titlebar mode. Theme, reduced transparency, and high contrast originate in the main process. The root stays transparent to the native material; CSS backdrop blur does not stand in for it.

## Lines

| Line | Meaning |
| --- | --- |
| Ring or border in the ring tone | Keyboard focus, or the focused island, dock, or tray |
| `selected` fill | Persistent selection; a fill rather than an outline |
| Moving dashed outline | Content still forming: a tool call receiving input or waiting to run |
| Still dashed outline | Content that ended incomplete or did not enter later model context |
| Red line on a faint red tone | The request that produced the content failed |
| Dashed target with an accent tint | Where a drop will land |
| Hairline between rows | Structure inside one group |
| Shell border | The edge between a shell and the window material |

Process blocks draw their state line along their rounded outline. Reduced motion keeps the moving dash still. A one-time warning ripple marks a newly raised notice and then disappears.

## Motion

Motion uses the shared Motion library for presence, layout, and shared elements, with timing and curves taken from the public motion tokens. Reduced motion is respected in both Motion and CSS. Feature views choose what moves, not their own durations or easing.

| Motion | Meaning |
| --- | --- |
| Travelling selection indicator | Selection moved; the same mark slides to the new item |
| Directional page change | Order and depth: siblings move along their navigation order; a deeper page enters from the side and returns the way it came |
| Asymmetric presence | Arriving content takes the shared fade; leaving content clears on the shorter exit timing, so the arrival reads as the subject |
| Height folding | Items join or leave a list, or a section opens and closes |
| Value transition | A value changed; unchanged values stay still |
| Activity trace | Work is in progress: an orbit around a stop control, a light along a tray edge, a moving dash on a forming block |

Command and searchable-choice surfaces share one motion definition across application and Agent palettes, command popovers, and reference suggestions: a short fade with restrained scale and translation, entering from the trigger-facing edge. One container owns sizing in these surfaces, and nested pages preserve the focus and state ownership of their control instead of remounting it.

Motion does not fight measurement. Virtual lists own item positioning and scroll compensation; disclosure animates content without a second layout system. Streaming Markdown uses the renderer's own pacing. History remounts render statically, and transitions do not replay merely because an item scrolled into view. Home and the workbench keep the same backing container while content loads, and the first Home display plays no entrance.

## Patterns

### Pages and islands

A page made of several cards, such as Home and usage statistics, places its cards directly on the window material. Controls that choose the source of a page's content, such as the workbench's object actions or usage statistics' view, range, and filters, sit in the window titlebar's action area.

Panel islands, such as editors and details, are non-modal and have no bottom action bar. Operations on the island's whole subject sit in its title bar between the title and the island menu and close controls: the primary action, such as Save, as a small button, and whole-subject actions, such as delete or restore defaults, as icon buttons, destructive ones in the destructive tone and confirmed separately. Operations on part of the content sit in that section's header. Plugin islands follow the same placement.

### Navigation and selection

Persistent navigation uses the shared selection indicator: one fill per navigation set that travels between items. The sidebar's main views and sessions share one set; settings categories and the usage view switch each have their own. The selected item stays distinct from the focused control.

A single choice among a few short options uses the segmented toggle group: a recessed track with one raised indicator that travels to the chosen option. Multiple-choice toggle groups keep independent toggles. Switches express immediate booleans, checkboxes express form or multi-selection, radios express explained single choices, tabs change content, and searchable choices use the shared command and popover combination. A two-state menu item is one checkbox item whose trailing indicator shows the state and whose label names the state rather than an action.

### Lists

An openable list row is one visual surface. Its primary button fills the row and holds the title, media, descriptions, and passive status. Menus, switches, status popovers, and drag handles are sibling controls with their own hit areas and focus. Hidden actions appear on row hover or visible keyboard focus and stay while their menu is open or their action is busy; retained pointer focus alone does not keep them visible.

An island whose whole content is a list uses the shared panel list body flush in a fill-layout panel: rows keep a small inset so fills stay inside the sheet, row text aligns with the panel title, hairlines separate rows, and the title bar carries the count. Empty, loading, failed, and no-match states replace the list with one centered icon and short label, plus a recovery action where one exists. Rows that open details end in a chevron and keep the selected tone while their island is open; rows whose operations finish in place carry those operations as row actions.

### Settings and forms

Settings rows and fields sit in groups on the page sheet, with hairlines between rows and the control at the row's end. Related fields and operations share a section, and values that override a baseline expose a reset. Every size-adjustment handle restores the default geometry on double-click and has a keyboard-accessible reset elsewhere.

### Process blocks and tool views

Thinking, tool calls, and summaries are process blocks: groups in the reading flow whose outline appears only for state. A tool header is one line: the operation name, then optional subject, summary, and trailing metadata. The subject is a low-emphasis badge naming the operation's focus, the summary is muted text that yields space first, and metadata stays visible. Resource creation and creation-entry inspection use the resource type as the subject, with an instance title in the summary when one exists; operations on an existing resource use its recorded name and kind icon, with paths, queries, or other details in the summary. Separate slots replace punctuation that would only join an object and its details, and the block itself presents exceptional outcomes. Unbounded inputs such as questions and commands appear as a single-line excerpt, with the full text in the body. Input, execution, and result reuse one block, so the reader's place survives each phase; content still being composed shows a bounded tail preview, and stable inputs and controls stay outside any live-output region.

Code, diffs, Markdown, math, diagrams, and reference chips render through the shared controls, so every plugin's output reads the same.

### Messages

User, Agent, and resource event messages share body rendering, and source presentation has one definition wherever a message appears. Placement, labels, and icons distinguish sources alongside the message tones.

### Inputs

The Agent composer and the Home entry are trays: a shell lifted over the content, holding a raised editor sheet, with configuration on the tray's lower edge. The tray border takes the ring tone while the editor is focused. Send and stop share one round slot so the action row keeps its width across execution states.

While an Agent runs, a light travels along the composer tray's top edge, an arc orbits the stop control, and a tab standing on the tray edge shows the elapsed time followed by the execution phase (working, retrying, waiting to retry, or compacting). The conversation itself carries no separate status row, and the card's title badge stays still. When an overlay hides the composer, the edge light and tab remain where the tray would stand. Continuous activity traces run as CSS animations, so a view remounted mid-run under a presence boundary that skips entry animations still shows them moving.

### Feedback and status

Status uses the shared status components with text and icons. Feedback stays with the operation it belongs to: field errors with fields, command progress at its entry, and Agent execution errors and warnings inline in the owning conversation. Independent interface command failures use toasts. One failure is never shown both inline and as a toast, and a background reread never becomes a global saving indicator.

### Buttons

| Variant | Role |
| --- | --- |
| Default | Primary action within its region |
| Outline | Supporting actions and recovery |
| Ghost | Navigation, row actions, compact controls |
| Secondary | Neutral secondary action |
| Selected | Current navigation or opened item where no travelling indicator applies |
| Destructive | Irreversible confirmation |
| Link | An action embedded in text |

Icon-only actions use the shared icon button, which supplies the accessible label, tooltip, and shape. Menu and popover triggers compose inside it rather than recreating its styling. Adjacent icon buttons in a title bar share one size. Destructive entry points and their confirmation remain distinct steps.

Disabled controls still show their tooltips, so a dimmed action can say what it does or why it is unavailable. Hover styling skips disabled elements instead of blocking pointer events.

### Tooltips and hover surfaces

A tooltip names or briefly explains the element under the pointer or keyboard focus: an icon action's label, a truncated value's full text, a mark's meaning, or the reason an action is unavailable. It is a floating surface like a popover, in the same tone with the same edge and shadow, and it has no arrow. It never holds the only copy of information the user needs to act, and nothing inside it is interactive.

One rhythm applies everywhere. Hover opens a tooltip after a deliberate pause, and each trigger waits again, so moving the pointer across a toolbar does not set off a run of hints. Keyboard focus opens the hint at once. Focus that returns to a trigger after a pointer interaction, such as closing its menu, does not reopen it. Placement, offset, and a bounded width come from the shared control, so call sites choose only the side and the content.

Because a tooltip shares the popover tone, its content uses the same tokens as content on a sheet: the foreground for primary lines, muted text for secondary lines, and status tones for warnings. Opacity does not stand in for muted text.

A richer preview that the user reads while hovering, such as a reference card or a metric breakdown, uses a hover card. Content the user opens on purpose, scrolls, or acts on, such as a template's object list, uses a popover behind a button. Information shown only on hover stays reachable from the keyboard: either the trigger is focusable, or the same text is part of a focusable element's accessible name.

## Branding

The Asterism identity is a triangular constellation of three rounded six-point stars. Application icons pair citron and deep green surfaces; interface marks use the same silhouette in the foreground color. The brand palette is independent of the configurable interface accent, and the mark stays recognizable without material effects. One geometry definition produces interface marks and exported artwork; the icon generator owns platform layouts and produces the committed assets.

## Ownership and extension

The theme owns color values, palettes, radius, density, and fonts. The host stylesheet owns the layer utilities, shadow and radius tokens, process-block state lines, and motion tokens. `packages/ui/` owns shared control semantics and appearance, and plugins receive those controls from the host so every plugin shares one copy. The window, its native material, and titlebar behavior belong to the main process and window components; island layout belongs to the weave.

Feature code composes these parts and does not create parallel button, select, border, shadow, or motion styles. A new recurring need becomes a token, utility, or shared control first, then its uses adopt it. shadcn registry files with local changes stay listed in the project conventions so registry updates can reapply them.

Visual changes are accepted manually on the actual platform in both schemes. Typechecks and builds support that acceptance; they do not establish appearance.
