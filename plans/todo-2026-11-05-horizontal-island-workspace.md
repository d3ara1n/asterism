# Horizontal island workspace

Status: Deferred. Planning only; implementation and final interaction details require a future session.
Filed: 2026-11-05.

## Goal

Replace the workbench's single-object focus mode and host-managed descendant island chain with a horizontally arranged window-like workspace. Users open or locate islands and work in several full-size surfaces, such as Agent A, a terminal, and Agent B, without being confined to canvas cards.

The canvas remains the primary place for object relationship operations. This is not a proposal to remove the canvas or replace its relationship editing with a list.

## Direction established in discussion

- The canvas participates in the horizontal workspace as a borderless island.
- Other work islands occupy the sequence to its right. Leftward placement conveys greater persistence or importance, not ownership of neighboring islands.
- Ordinary work islands can close independently and must support drag reordering.
- Opening or locating an island replaces the product concept of entering object focus mode. Keyboard focus still exists for input and viewport navigation.
- Screen arranges islands and tracks which islands exist; it does not infer business relationships from their positions.
- A logical sequence of related views may have unrelated islands inserted between them. Adjacency must not determine validity, replacement, or cascading closure.
- Features may explicitly coordinate related islands when required by their domain. The generic layout layer does not maintain a parent/child view chain.
- The left navigation sidebar and sidebars opened from the upper-right menu participate in layout but retain their own opening, closing, and interaction behavior. They are not ordinary reorderable work islands.
- Existing object relationship and authorization semantics remain unchanged by island placement.

The user considered a menu-controlled canvas visibility toggle, but ultimately expressed a preference for retaining the canvas as the first island rather than allowing it to close. Treat that as the preferred direction, not a finalized visibility contract.

## Why this is a substantial change

The existing horizontal rendering is reusable, but the present composition and lifecycle model are not the requested window model. This is a coordinated layout, navigation, plugin API, and persisted-state change, including drag interaction. Do not scope it as simply changing one focus object ID into an array.

### Verified starting points

- `src/renderer/shared/weave/Screen.tsx` already composes horizontal islands, measures available width, follows the active island during overflow, and provides overflow navigation. Its managed islands currently form a root/deeper chain with replacement and cascading closure.
- `src/renderer/shared/weave/model.ts` separates some pure layout and strip operations, but its open/close operations encode the descendant chain.
- `src/renderer/app/App.tsx` assembles navigation, a single leading focus island, and the main workbench.
- `src/renderer/features/workbench/focus.ts` and `FocusIsland.tsx` implement moving one object's content out of its canvas card into a special island. `ObjectNode.tsx` renders the corresponding card placeholder.
- Object view resolution is shared between cards and the focus island. Existing Agent and resource content need not be rewritten solely to change their container.
- `src/shared/workbench.ts`, `src/runtime/workbench.ts`, and `src/runtime/storage.ts` define and persist one focus target and width per session.
- `packages/sdk/src/renderer-island.ts` exposes child/deeper-island behavior. The host adapter in `src/renderer/features/plugins/scope.tsx` and plugin consumers depend on those semantics. Plugin settings also use these capabilities and need an explicit disposition.

These are investigation entry points, not an exhaustive change list. Recheck current code when resuming.

## Decisions to settle before implementation

1. **Canvas policy:** preferred fixed first island, not closable or reorderable; confirm whether a menu visibility toggle is wanted. Leaving the viewport is distinct from closing it.
2. **Opening placement:** choose the default insertion position for newly opened objects and feature views. Decide how an explicit placement request interacts with a user's reordered layout, without restoring implicit parent ownership.
3. **Identity and reuse:** define which requests locate an existing island, update an existing view, or create a separate instance. Object islands and file/location views may need different identities. The existing plugin key contract replaces content on repeat open; do not silently reinterpret it.
4. **Card behavior:** decide what a canvas card shows while its object is open in an island, and whether inline interaction remains available. Avoid accidental duplicate editors, independent drafts, or terminal renderers.
5. **Restore scope:** determine which islands, order, widths, and view locations survive session switches and application restart. Runtime React render callbacks are not serializable restore descriptors. Identify restorable plugin views rather than promising universal restoration.
6. **Close behavior:** distinguish closing UI from removing objects, cancelling Agent work, and ending terminal processes. Preserve real dirty-editor close guards. Define session navigation and settings-page disposal without adjacency-based cascading closure.
7. **Drag interaction:** confirm the draggable title/handle area, canvas anchoring, keyboard reorder operation, and behavior when navigation or menu sidebars are visible.
8. **SDK and storage compatibility:** approve the island API semantics and persisted layout format. Review distribution status before selecting migration versus a development-format rebuild. This plan authorizes no real-data cleanup.

## Work packages

### 1. Flat workspace model

- Introduce explicit ordinary-island identities, order, widths, and active-island state without parent/child layout ownership.
- Separate participation in geometry from ordinary-window lifecycle so navigation and menu sidebars keep their own behavior.
- Keep the canvas first according to the selected policy; do not require every screen to have an immortal root solely because the canvas is persistent.
- Define pure insert, locate, move, and independent-close operations, including missing targets and active-island selection after close.
- Preserve useful width allocation and overflow calculations where their assumptions remain valid.

### 2. Window operations and plugin integration

- Replace the workbench focus entry points with open-or-locate operations.
- Adapt object content containers and canvas card behavior to the chosen single/multiple presentation policy.
- Replace layout-derived child APIs in the SDK and host adapter with the approved flat-island contract.
- Audit builtin plugin consumers, resource-location navigation, settings views, and explicit related-view behavior. No generic closure or replacement based on being to the right.
- Keep dirty-state checks, invalid-content disposal, and focus restoration meaningful when the opening element or neighboring island is gone.

### 3. Drag reordering and horizontal navigation

- Use a maintained drag/sort library rather than hand-building general drag infrastructure. Evaluate reuse first; obtain separate approval for any new dependency, explaining alternatives and tradeoffs.
- Reorder ordinary islands by a dedicated handle/title region without capturing terminal selection, text editing, canvas pan/link gestures, buttons, or interactive island content.
- Handle variable island widths, partially visible islands, horizontal overflow, edge auto-scroll, drop feedback, and cancellation.
- Keep drag coordinates, viewport translation, layout animation, and insertion hit testing consistent. Avoid competing automatic active-island following and drag edge scrolling.
- Reordering must preserve island identity and mounted content state rather than remounting editors, conversations, or terminal views.
- Provide an accessible keyboard alternative and deliberate focus/viewport behavior after reordering.
- Keep special sidebars outside the ordinary reorder target sequence.

### 4. Persistence and lifecycle

- Persist the approved session layout state and restore supported views through explicit descriptors.
- Remove the obsolete single-focus model after updating its consumers.
- Handle removed or retiring resources and unavailable plugin views without invalidating unrelated islands.
- Define which state is frontend-local and which is stored; ordinary later-processed writes win. Do not introduce speculative revision/conflict machinery.
- Implement only the approved format compatibility strategy; no silent fallback or destructive cleanup.

### 5. Integration and cleanup

- Preserve canvas creation, relationship manipulation, object menus, and resource management while changing how full-size views open.
- Retain borderless canvas presentation and the existing shared surface language; final visuals need user acceptance.
- Remove obsolete focus-mode copy, return-to-card assumptions, chain navigation APIs, and their tests once replaced.
- Update English/Chinese application copy and affected documentation for the actual behavior. Keep model-facing harness text in English.

## Validation and acceptance

Implementation requires affected TypeScript checks, a renderer build, and focused tests at the owning boundaries. Test meaningful pure ordering/layout/navigation calculations and serialized layout interpretation; do not add UI-rendering, fake-timing, schema-only, or direct-forwarding tests.

Manual acceptance scenarios:

- Open Agent A, a terminal, and Agent B simultaneously; reopening an existing object follows the approved identity/reuse rule without replacing unrelated islands.
- Return to the canvas and edit object relationships; the canvas remains the primary relationship surface.
- Reorder variable-width islands, including beyond the visible horizontal area, without losing input drafts, editor changes, conversation position, or terminal view state.
- Insert an independent island between logically related views; close or move one without host-inferred cascading closure.
- Close a dirty editor and exercise both cancellation and confirmation while unrelated islands remain intact.
- Use sidebar/menu controls and ordinary island operations without crossing their lifecycle or reorder rules.
- Switch sessions and restart the application; restore exactly the categories of state promised by the selected restore contract.
- Remove a resource with an open island; preserve access to unrelated work.
- Verify keyboard navigation, accessible reorder controls, active-island visibility, and interaction with terminal/editor/canvas gestures.

GUI interaction and final visual behavior are accepted by the user; do not automate launch-wait-kill smoke cycles.

## Suggested execution sequence

1. Reinspect current consumers and resolve the decisions above; present the concrete scope and API/storage tradeoffs.
2. Implement the flat model and window lifecycle together with its host/plugin adaptation.
3. Integrate drag ordering and overflow behavior as a core deliverable, not an optional follow-up.
4. Complete persistence, remove the old focus/chain model, and run focused validation.
5. Obtain user acceptance for the integrated interaction and summarize the diff before requesting commit permission.

This sequence is an engineering breakdown, not permission to ship an intermediate multi-focus design. No implementation, dependency addition, compatibility promise, data cleanup, or commit is authorized by filing this plan.
