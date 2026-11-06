# Resolve GUI acceptance findings before release

Filed: 2026-11-06
Status: Areas 1 and 2 implemented and accepted by the user. Area 3 remains deferred.
Investigated source: `35a13161` on `main`.

## Scope and release status

During manual acceptance of changes after `v1.0.0-prerelease.15`, the user reported three remaining problem areas: application-palette theme selection, Dock layout/animation, and the session menu's Keep awake control. The user reported the other checklist areas as acceptable. This is user feedback, not an automated GUI test result.

The user initially deferred fixes so these areas could be addressed individually, including control replacement if warranted. The original investigation changed no implementation, installed no dependencies, launched no GUI, and performed no commit, push, or release action. The subsequent Area 2 trial and Area 1 replacement are recorded below. Release remains on hold pending disposition and manual acceptance of these findings.

Keep this work separate from `todo-2026-11-06-layout-terminology.md`: the present task concerns behavior and presentation, not renaming the layout concepts. No broad redesign, unrelated refactoring, new recovery mechanisms, or additional permission layers are in scope.

## 1. Replace the application palette with cmdk and nested action pages

### Reported symptom

On first opening the application command palette, all three theme options look unselected. The user reported that selecting another option with the mouse produces a clearly visible selection and initially identified this as missing runtime selection rather than a color issue. A subsequent user-supplied first-open Console snapshot showed mode `system`, with System `aria-checked="true"` and `data-state="on"`, and both other items false/off. The snapshot establishes that selection reaches the DOM in that captured state; the visual symptom remains unresolved.

### Original investigation before replacement

Confirmed source facts:

- `src/renderer/features/commands/settings.tsx:17–32` reads the shared appearance store, passes `appearance.mode` as the controlled ToggleGroup value, and declares matching System/Light/Dark values. Empty changes are ignored.
- `src/renderer/features/appearance/state.ts` uses a module-level external store, not an appearance React provider that can be lost across collection rendering. The default configured mode is System; loading changes readiness rather than setting an empty mode.
- `src/renderer/features/commands/ApplicationCommands.tsx:101–108,153–176` initially focuses search and marks the first enabled row as the default result. Theme is the first host command.
- The default/focused row uses `bg-accent` and `text-accent-foreground` at `ApplicationCommands.tsx:49–50`. Selected toggles use those same tokens, while unselected outline toggles are transparent (`packages/ui/src/ui/toggle.tsx:9–15`). This token overlap is a candidate explanation for the first-open visual symptom; computed styles in the affected state have not yet been captured.
- React Aria renders collection contents separately from their declarations, but this complete ToggleGroup subtree is inside one GridListItem's rendered children (`ApplicationCommands.tsx:38–54`). The root and its items remain together; source tracing did not establish a broken Radix context.

The investigation initially favored a row-highlight/selection styling collision, then pursued missing runtime selection after the user's clarification. The subsequent DOM snapshot resolves that distinction for the captured first-open state: System is selected semantically and has its on-state styling attribute. The report that no option looks selected remains valid, but missing initial selection is not supported by this snapshot.

Follow-up source inspection traced the default and preload-normalized appearance value, the command contribution, collection leaf capture/update/render, and the installed Radix controlled-state implementation. The preload normalizes read and saved values through `parseAppearance`; the default mode is System. Radix derives the selected item during render by comparing the controlled group value with each item's value, and exposes `aria-checked` and `data-state` for this single-selection group. No click-dependent initialization was found. Collection relocation keeps the complete ToggleGroup subtree together, and these command sections do not use the dynamic item/render-function cache. Neither a broken Radix context nor a stale collection cache was established.

The first-open DOM snapshot is consistent with the source trace. Comparing row highlight/focus state and computed colors was the proposed next diagnostic, but was not carried out. The user subsequently chose replacement because the palette's interaction and selection behavior were unsatisfactory beyond this visual symptom. No implementation correction, forced remount, delay, or styling workaround was added.

### Replacement decisions and implementation — 2026-11-06

The user first requested native arbitrary-inline-control support. After reviewing alternatives, the user removed that requirement and selected the existing cmdk implementation for relevance sorting and nested command pages. Research and its disposition are preserved in `archived/ref-2026-11-06-command-palette-inline-controls.md`. The user approved the migration scope and requested implementation.

- [x] Replace React Aria Autocomplete/GridList with the existing shared shadcn/cmdk components. Remove the default-row MutationObserver and custom search-to-row focus routing.
- [x] Remove arbitrary interactive command content from the SDK contract. Entries execute an action or open nested children; supplementary content is read-only.
- [x] Move theme selection to a nested System/Light/Dark page. A trailing check marks the saved value separately from cmdk's navigation highlight. Saving keeps the page open, disables descendant actions while pending, and retains appearance persistence.
- [x] State each fact once: the root Theme row uses a fixed icon and names the saved mode as its detail; the nested page shows only its return control and options, without repeating the group heading or the parent's detail.
- [x] Restore dialog open/close animation by keeping content mounted with the dialog's presence. Share the return control, empty-query Backspace handling, list-height transition, and depth-directed page entry motion with builtin's Agent palette through `@asterism-app/ui/command-page`; the page motion animates in place so rendered command state is not remounted.
- [x] Preserve automatic naming as a plugin-owned asynchronous action: disabled reentry, spinner, failure feedback, and success-only dismissal. Manual session renaming remains in its existing dialog.
- [x] Preserve update checks, read-only status/progress, and the explicit install action. Checking leaves the palette open, and closing does not cancel application-owned update work.
- [x] Keep plugin contribution hooks, preferences, and call scopes mounted across filtering and page navigation. Closing releases plugin scopes. Command content renders in its owning provider subtree without collection-specific bridges.
- [x] Use numeric fuzzy scores for relevance ranking. Labels, source/group attribution, and aliases are searchable; internal command identities are excluded.
- [x] Remove `react-aria-components` and its unused dependency tree. No new dependency was added. Shared ToggleGroup consumers remain unchanged.

Validation passed: `npm run typecheck`, `npm exec vitest run src/renderer/features/commands/model.test.ts` (5 cases), `npm run i18n:check`, and `npm run build`. The build reports a chunk-size warning; Vitest reports the configured esbuild/oxc option precedence. Tests cover nested identity resolution, unavailable paths, inherited disabling, and sibling identity conflicts, not UI rendering or interaction. No GUI was launched or accepted by this implementation validation.

### Manual acceptance — 2026-11-06

The user reported the replacement, including the follow-up page motion, nested-page deduplication, and shared Agent-palette page controls, as accepted. This is user-reported acceptance, not automated GUI verification; the conversation does not establish separate results for every item below. Area 1 is closed.

- [x] Open the palette with the application menu and platform shortcut; search results rank by relevance without exposing internal IDs as aliases.
- [x] Enter Theme, verify exactly one saved-choice check immediately, and distinguish it from the keyboard highlight under light/dark and supported accent treatments.
- [x] Change each theme, verify persistence after reopening, and verify System remains the configured preference when the OS-resolved scheme changes. Activating the current choice does not clear it.
- [x] Verify search and highlight reset on page navigation and reopening; use the return control and empty-query Backspace to navigate back. Escape closes and restores opener focus.
- [x] Verify loading/saving disabling and error feedback. Automatic naming preserves busy/error behavior and closes only on success; manual rename remains unchanged.
- [x] Verify update check/download feedback, no duplicate activation while busy, explicit install/restart activation, and continued application-owned work after closing the palette.
- [x] Verify plugin attribution and session applicability, including a current page becoming unavailable. Plugin calls retain their scope across navigation/filtering and are cancelled when the palette closes.

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

The user accepted the sidebar animation and overflow-edge spacing result and requested that the plan be updated and the changes committed. This is user-reported visual acceptance, not automated GUI verification. Area 2 is closed.

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

The original application palette used React Aria Components Autocomplete/GridList, while builtin's Agent palette used cmdk. The implemented replacement now uses cmdk for both command surfaces, without merging their keyboard scopes or feature ownership. The session menu still uses Radix DropdownMenu; its Keep awake presentation is a separate finding.

The installed cmdk implementation renders arbitrary children, but its listbox/option model does not establish independently focusable nested-control support. The user deliberately removed that requirement: rows contain actions, nested-page entries, and read-only content. This is not a claim that changing libraries fixed the original inline-control composition or established a new native-control capability.

## Completion and validation

Implement these areas individually after the relevant choices, rather than treating this document as approval of a replacement control or new dependency. Run appropriate typechecks and builds for later UI changes. Add unit tests only for meaningful extracted deterministic logic; do not add rendering/interaction tests or unrelated runtime/history-suite runs to substitute for manual acceptance.

Record each area's disposition and the user's acceptance. Only after the remaining GUI findings are accepted should push/release be reconsidered; that still requires explicit user authorization. Archive this plan when all tasks have a disposition.
