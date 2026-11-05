# Horizontal island workspace

Status: Implemented; initial GUI check by the user passed. Decisions below were settled with the user.
Filed: 2026-11-05.

## Goal

Replace the workbench's single-object focus mode and the host-managed replacement chain with a horizontally arranged, window-like island workspace. Users work in several full-size islands at once, such as Agent A, a terminal, and Agent B. The canvas remains the primary surface for object relationship operations.

## Settled decisions

### Layout regions

- The left navigation sidebar and the canvas are fixed at the leading edge. The canvas is the origin of everything: it cannot close, hide, move, or be resized through the island menu.
- Sidebars opened from the upper-right menu (Access, Objects, History) are fixed at the trailing edge. They keep their own toggle behavior and are mutually exclusive as today.
- Special regions participate in geometry only. They do not take part in ordinary island operations.
- Ordinary islands sit between the canvas and the trailing sidebar. A newly opened island is always appended at the right end of the ordinary sequence.

### Identity and reuse

- The host manages islands; consumers decide identity. `open` with a key that is already present activates that island; otherwise it appends a new island. There is no replacement concept: opening B never displaces A.
- Singleton versus multiple instances follows from the consumer's key choice. Examples: one provider editor per provider, one island per opened file path, one island per focused object.
- Positions carry no meaning. Cascading closure follows the explicit opener relation: closing an island first closes the islands it opened, recursively, regardless of their positions. Islands opened from the canvas, or from content rendered inside canvas cards, have no closable owner.

### Object islands (formerly focus)

- Opening an object in an island is an ordinary singleton island keyed by object ID. Several objects can be open at the same time.
- While an object is open in an island, its card keeps the existing placeholder notice with the return action, and the open-in-island control is hidden. Object content mounts only once.
- Card-retained frontend state (`RendererRetained`) continues to carry drafts across container changes and session view disposal.

### Island chrome

- Every ordinary island has a host-provided island menu: size presets and reset, move left, move right, and close. Size is a chrome concern independent of content. Content headers (`ObjectSurface`, `IslandPanel`) provide only the place where the host menu renders.
- Moving swaps with the neighboring ordinary island. There is no drag reordering, so no drag dependency is added. Special regions are never swap targets.

### View descriptors and restoration

- The SDK island `open` accepts either form:
  - A restorable view: a registered island view ID plus JSON parameters, an optional resource reference, and a key. Restorable islands in a conversation are persisted and rebuilt from descriptors after session switches and restarts.
  - A transient render: the current render callback form. It lives only for the current run and is not restored.
- Plugins register island views in their renderer module. The host registers its own object island view.
- Settings remain transient: same mechanism (singletons, cascading closure, chrome), no persistence.
- Resource islands can align their descriptors with reference URLs (`resource:<id>/<location>`) and resolve through the resource opener contract.

### Session and lifecycle

- Each conversation persists its ordinary island order, descriptors, owner relations, and width overrides. Switching sessions closes the current islands through their guards and restores the target session's islands.
- When a resource leaves the current projection or begins retiring, the host force-closes islands bound to it and the islands they opened. Unrelated islands remain.
- Closing an island never removes objects, cancels Agent work, or ends terminal processes. Dirty-editor close guards remain.
- Restorable descriptors whose view is unavailable keep their place and show an unavailable notice instead of being silently dropped.

### Storage and SDK compatibility

- No compatibility promise for the old focus format: a workspace migration drops `workbench_focus` and creates the island layout table. Existing focus state is not carried over. No real-data cleanup is involved.
- The SDK island API changes without a compatibility layer: `child` and `closeChild` become a presence query and owned-island closure; repeat open activates instead of replacing.

## Work packages

1. Flat strip model: pure open-or-activate, owned closure, neighbor swap, width override, and restore operations with focused tests. Keep `layout()` and `follow()`.
2. Screen and SDK: fixed leading/trailing regions, ordinary islands, owner tracking, chrome menu, presence query, restorable view registration, plugin adapter.
3. Workbench integration: object islands replace focus; trailing sidebars move out of the ordinary chain; card placeholder subscribes to island presence.
4. Consumer migration: settings pages, builtin configuration pages, file and note openers, resource navigation.
5. Persistence: snapshot schema, runtime command, migration, restore on session entry, resource-removal disposal.
6. Cleanup: remove focus-mode code and copy, update English/Chinese copy and affected documentation.

## Validation and acceptance

Typecheck affected packages, build the renderer, and test the pure strip operations and layout interpretation. No UI-rendering, timing, schema-only, or forwarding tests.

Manual acceptance (by the user):

- Open Agent A, a terminal, and Agent B together; reopening activates the existing island.
- Open provider A then B in settings: both editors remain; reopening A activates it; closing the provider list closes both.
- Move islands left and right, including when overflowing; drafts, editor changes, conversation position, and terminal state survive.
- Close a dirty editor with both cancel and confirm.
- Toggle the trailing sidebars alongside ordinary islands.
- Switch sessions and restart; restorable islands return in order with their widths; transient islands do not.
- Remove a resource with an open island; unrelated islands remain.

## Outcome

- Restorable views did not need a new plugin registration API. Object islands restore from the object ID; resource islands restore by rerunning the resource's open handler for the stored location against a capturing island. Islands opened directly with `render` remain transient, including settings editors and the note editor.
- Persistence is a v32→v33 workspace migration that replaces the focus table with a per-session island arrangement; a previously focused object is not carried over.
- Known limitations left as is: after a settings editor renames or creates an item, the list highlight follows the key it was opened with; islands of a disabled plugin are dropped on restore and leave the stored arrangement on the next write; one resource open marks only its first opened island as restorable.
