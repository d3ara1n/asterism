# Resolve GUI acceptance findings before release

Filed: 2026-11-06
Status: Area 2 implemented and accepted by the user. Areas 1 and 3 remain deferred.
Investigated source: `35a13161` on `main`.

## Scope and release status

During manual acceptance of changes after `v1.0.0-prerelease.15`, the user reported three remaining problem areas: application-palette theme selection, Dock layout/animation, and the session menu's Keep awake control. The user reported the other checklist areas as acceptable. This is user feedback, not an automated GUI test result.

The user explicitly deferred fixes so these areas can be addressed individually, including control replacement if warranted. The original investigation changed no implementation, installed no dependencies, launched no GUI, and performed no commit, push, or release action. The subsequent Area 2 trial is recorded below. Release remains on hold pending disposition and manual acceptance of these findings.

Keep this work separate from `todo-2026-11-06-layout-terminology.md`: the present task concerns behavior and presentation, not renaming the layout concepts. No broad redesign, unrelated refactoring, new recovery mechanisms, or additional permission layers are in scope.

## 1. Make the current theme visibly selected on first palette open

### Reported symptom

Opening the application command palette makes all three theme options appear unselected.

### Investigation

Confirmed source facts:

- `src/renderer/features/commands/settings.tsx:17–32` reads the shared appearance store, passes `appearance.mode` as the controlled ToggleGroup value, and declares matching System/Light/Dark values. Empty changes are ignored.
- `src/renderer/features/appearance/state.ts` uses a module-level external store, not an appearance React provider that can be lost across collection rendering. The default configured mode is System; loading changes readiness rather than setting an empty mode.
- `src/renderer/features/commands/ApplicationCommands.tsx:101–108,153–176` initially focuses search and marks the first enabled row as the default result. Theme is the first host command.
- The default/focused row uses `bg-accent` and `text-accent-foreground` at `ApplicationCommands.tsx:49–50`. Selected toggles use those same tokens, while unselected outline toggles are transparent (`packages/ui/src/ui/toggle.tsx:9–15`). The row fill can therefore mask the selected toggle's main visual distinction.
- React Aria renders collection contents separately from their declarations, but this complete ToggleGroup subtree is inside one GridListItem's rendered children (`ApplicationCommands.tsx:38–54`). The root and its items remain together; source tracing did not establish a broken Radix context.

The strongest explanation is a row-highlight/selection styling collision. Actual first-open attributes and computed colors were not inspected, so an all-off runtime state has not been ruled out by GUI evidence.

### Deferred work

- [ ] On first open, inspect whether exactly one option has `data-state="on"` and `aria-checked="true"`; compare the controlled mode and computed colors.
- [ ] Check whether selection becomes visually distinct when default-row highlight, hover, or row focus moves away. This is diagnostic, not a permanent workaround.
- [ ] Choose a local remedy after that distinction: a persistent selected treatment for this palette control, or adjustment of the row/control highlighting relationship.
- [ ] Evaluate replacement only if the confirmed problem warrants it. Neither replacement of the collection library nor a new context bridge is justified by the current evidence. Any control/interaction change requires user approval; new dependencies require separate approval.
- [ ] Implement the chosen correction without changing shared ToggleGroup styling for unrelated consumers unless explicitly approved.

### Manual acceptance

- [ ] Exactly one configured preference is visibly selected immediately, without clicking.
- [ ] System denotes the configured preference even when the OS-resolved light/dark scheme changes.
- [ ] Selection remains distinct under default-result highlighting, hover, row focus, control focus, and search filtering.
- [ ] Changing an option updates the appearance and survives closing/reopening; selecting the current option never leaves an empty selection.
- [ ] Loading/saving preserves the indicated selection while interaction is disabled.
- [ ] Check light/dark appearance and the supported accent treatments.

## 2. Restore coordinated Dock and Screen geometry

### Reported symptoms

- Navigation exit animation is no longer visible.
- Entrance animates the sidebar itself but not the surrounding layout's accommodation.
- The right auxiliary panel appears to cover Screen rather than reserve space.

### Original investigation

Confirmed source facts:

- `src/renderer/shared/weave/Dock.tsx:18–20` animates opacity, translation, and scale only. It has no width animation or Motion layout participation.
- `src/renderer/styles.css:257–262` defines fixed 224px navigation and 320px auxiliary Dock widths in a flex page. Screen is a plain `flex-1`, `min-w-0`, clipped viewport (`App.tsx:334–340`; `Screen.tsx:304`; `styles.css:270–271`).
- Mounting a Dock reserves its full flex width immediately. `AnimatePresence mode="popLayout"` removes an exiting Dock from normal flow immediately. The installed Motion implementation injects absolute positioning for that exit (`node_modules/framer-motion/dist/es/components/AnimatePresence/PopChild.mjs`).
- Screen observes its resized viewport, then animates individual Island positions/widths. This does not animate Screen's outer position or its flex allocation (`Screen.tsx:180–188,304–314,377–379`). Extracting the Docks from the Island span calculation removed their former shared geometry animation.
- Dock still declares a 200ms exit. Its React 19 ref prop is passed to the DOM node, and the installed Motion implementation reads that prop. There is no evidence for a speculative `forwardRef` workaround.
- The resting source layout reserves auxiliary width. Persistent overlap after animation settles is not explained by these rules. Exit overlap is structurally possible because a popped-out panel remains painted while Screen reclaims the space; entrance also translates the panel 16px left.

Loss of coordinated outer layout animation is confirmed. Exit occlusion and persistent right-panel overlap remain distinct observations to investigate, rather than additional proven causes.

### Disposition and decisions

- [x] Keep Docks page-local and outside Screen's Island strip.
- [x] Animate reserved width in persistent flex slots, keeping Dock contents at their intended width. The user approved the trial and accepted the resulting approach.
- [x] Keep one auxiliary surface and reserved width when switching Objects/Access/History; crossfade its contents.
- [x] Move Screen's horizontal spacing outside its clipping boundary so overflow retains a visible gap beside both sidebars.
- [x] Retain the existing overflow navigation strip, which the user explicitly praised.
- [x] Record the remaining visible chasing as an accepted limitation: the user reported that it does not interfere with use. No further tuning is scheduled by this finding.

The original diagnostic leads included classifying Home/session behavior, distinguishing settled overlap from transitional overlap, and inspecting the exiting navigation DOM for occlusion. These were not carried out as GUI inspections during implementation. The chosen correction addresses slot geometry and clipping without a speculative stacking change; the original occlusion hypothesis is not promoted to a confirmed cause.

The alternative of immediate flex allocation plus layout projection was not selected. Changing only `popLayout` to `sync` would not have restored entrance accommodation. Projection on Screen was not treated as a drop-in option because Screen exposes a `ScreenHandle`, not its viewport DOM ref.

### Manual acceptance — 2026-11-06

The user accepted the sidebar animation and overflow-edge spacing result and requested that the plan be updated and the changes committed. This is user-reported visual acceptance, not automated GUI verification. Area 2 is closed; the plan remains active for Areas 1 and 3.

The original acceptance scope covered visible entrance/exit and continuous accommodation, settled auxiliary width, panel replacement without duplicate space or leftover overlays, both Docks alongside Island overflow/focus-following, focus restoration and page navigation, and reduced-motion behavior. The conversation does not establish separate test results for every combination in that scope.

### Trial implementation — 2026-11-06

The user approved trying continuous reserved-width animation first. If that is not satisfactory, the agreed fallback to try next is immediate space allocation with entrance/exit animation only on the side panels; the fallback is not implemented or exposed as a setting.

- Persistent page-local flex slots animate their reserved width. Dock surfaces retain their fixed width and are clipped to their own slot rather than painting over Screen.
- Screen applies focus-following constraints in the same geometry update. Viewport resizes place Islands directly at their measured targets, avoiding an additional interpolation behind the outer width transition; ordinary Island operations retain their position/width animation.
- Auxiliary panel replacement retains one Dock surface and slot, crossfades the keyed content, and makes outgoing content inert. The existing panel autofocus is reapplied on content replacement.
- Reduced-motion handling removes the slot's CSS transition and Island geometry interpolation; the existing Motion configuration continues to govern surface transforms.

Validation passed: `npm run typecheck`, `npm exec vitest run src/renderer/shared/weave/model.test.ts` (12 cases), and `npm run build`. The build reports a chunk-size warning; Vitest reports the configured esbuild/oxc option precedence. No new dependencies or rendering/interaction tests were added.

Implementation validation did not launch or inspect the GUI; visual acceptance came from the user as recorded above. No stacking correction was added, and no claim is made that the original overlap or exit-occlusion observation was independently reproduced.

### Trial feedback and edge-spacing adjustment

The user reported that some chasing remains visible but does not interfere with use. The user also reported that an Island pushed outside the available width appears cut off directly against a sidebar, resembling sidebar occlusion, and proposed moving Screen's horizontal spacing outside its clipping boundary. The overflow navigation strip received positive feedback and is retained.

The follow-up moves horizontal spacing from the Island strip's inset to Screen viewport margins. Island layout width and the navigation strip's page-relative horizontal bounds remain equivalent; the bottom inset and navigation behavior are unchanged. Overflow now clips inside the exterior gap instead of painting through the previous internal spacing. The user accepted this spacing adjustment. Typechecking and the build also passed after the adjustment.

## 3. Separate Keep awake identity from its checked state

### Reported symptom and intended presentation

Keep awake has an extra icon/indentation compared with neighboring session-menu items, and its checked mark is easily confused with the Mark completed action. The user wants Coffee as its sole leading identity icon, label text without another leading symbol, and a trailing state control.

### Investigation

- `src/renderer/app/SessionActions.tsx:73–81` uses a regular menu action for completion, with Check/Undo icons. Keep awake uses `DropdownMenuCheckboxItem` and adds Coffee as its child.
- `packages/ui/src/ui/dropdown-menu.tsx:84–106` reserves an additional leading indicator column (`pl-8`) and inserts an absolute left-side Check icon for checked items. The supplied Coffee icon then occupies the content area. This explains the extra slot and duplicated leading-icon presentation.
- The underlying Radix primitive already owns `role="menuitemcheckbox"`, `aria-checked`, and checked-state activation. This is not a lack of checked-state support.

### Deferred work and decisions

- [ ] Choose the trailing state presentation with the user: a checkbox-style indicator retaining one menuitemcheckbox focus/activation target, or a genuinely independent toggle control in a container designed for nested controls.
- [ ] Keep Coffee in the same leading icon column as neighboring menu items. Put state at the trailing edge; retain checked semantics and accessible labeling.
- [ ] Choose the narrow ownership boundary: local session-menu composition versus an approved shared menu-component option. If a vendored registry component changes, update its local-change record in `AGENTS.md`.
- [ ] Preserve busy/disabled behavior and state persistence. Avoid nesting a second independently interactive checkbox/switch without addressing focus, event handling, and accessibility semantics.

### Manual acceptance

- [ ] Coffee is the only leading icon in both states, and label alignment matches neighboring rows.
- [ ] The trailing control clearly distinguishes enabled/disabled state without being confused with the completion action.
- [ ] Pointer, Enter/Space, menu navigation, busy/disabled state, and reopening behave consistently; one activation changes the value once.
- [ ] The checked state is correctly announced by assistive technology and persists after reopening the menu/application.

## Control-library boundary

The application command palette uses React Aria Components `Autocomplete`/`GridList`, not cmdk (`ApplicationCommands.tsx:2–4`). Builtin's Agent palette uses cmdk, and the session menu uses Radix DropdownMenu. These are separate surfaces; a session-menu presentation change does not require replacing the application palette.

The installed cmdk implementation renders arbitrary children, but its collection uses `listbox`/`option`, input-held active-descendant navigation, and row-level Enter selection. Being able to render a checkbox or ToggleGroup inside an option is not equivalent to supporting independently focusable nested controls with correct keyboard and accessibility behavior. It is therefore inaccurate both to say cmdk cannot render such content and to assume it provides the required composite interaction. Retain this distinction when evaluating future control changes; do not introduce bespoke keyboard workarounds merely to preserve a library choice.

## Completion and validation

Implement these areas individually after the relevant choices, rather than treating this document as approval of a replacement control or new dependency. Run appropriate typechecks and builds for later UI changes. Add unit tests only for meaningful extracted deterministic logic; do not add rendering/interaction tests or unrelated runtime/history-suite runs to substitute for manual acceptance.

Record each area's disposition and the user's acceptance. Only after the remaining GUI findings are accepted should push/release be reconsidered; that still requires explicit user authorization. Archive this plan when all tasks have a disposition.
