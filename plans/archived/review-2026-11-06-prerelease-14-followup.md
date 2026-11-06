# Release review after prerelease.14

Filed on 2026-11-06.

## Scope and method

Reviewed `v1.0.0-prerelease.14` (`2d238ec8`) through `5f13bc63`: 12 commits, 63 changed files, 726 insertions and 308 deletions. The working tree was clean at the start. The user had manually accepted the interfaces; this review examines correctness, code quality, and useful reorganization before the next release, rather than repeating visual acceptance.

Three read-only reviewers worked in parallel on distinct ownership areas:

- Conversation drafts, attachments, exchange, and their presentation state.
- Template island persistence, workbench ownership, navigation, and panel motion.
- Inline execution feedback, editor wrapping, shared controls, and related small UI changes.

The coordinating review covered macOS window/runtime lifecycle, centralized storage names, resource-script documentation, documentation consistency, and cross-module verification of the findings. A fourth parallel slot remained unused because no additional independent investigation was necessary. Findings below were checked against the current callers, not accepted solely from the delegated reports.

No implementation was changed. No GUI was launched, no real application data was modified, and no commit or remote write was performed. This file records the review; it does not authorize changes.

## Findings

### R1 — P2: Returning a template-restored object island to its card is a no-op

**Locations:** `src/runtime/templates.ts:99–105`, `src/renderer/features/workbench/Workbench.tsx:60–71`, `src/renderer/features/workbench/session-islands.ts:57–65`, and `src/renderer/shared/weave/Screen.tsx:234–242`.

**Reproduction:** Save a template with an open object island, create a session from it, then click **Return to card** on the object's canvas card.

Template instantiation intentionally gives restored object islands `owner: null`. Restoration preserves that ownership. The canvas card invokes `closeObject`, which calls `island.closeOwned({ target })` from the canvas/root island. Targeted `closeOwned` only closes a direct child whose owner equals the caller's ID. It therefore computes an empty closure and reports success without removing the restored island. The card stays in its opened-in-island placeholder state. The island's own close control still works.

**Suggested correction:** Close the object island by identity through the existing `IslandStrip.close(...)` capability. This preserves guard consultation and descendant closure without requiring canvas ownership. Update the nearby ownership comment to reflect the distinction between newly opened and template-restored islands. Do not encode the renderer root ID into runtime template data or weaken `closeOwned` semantics.

**Release recommendation:** Fix before release. This is a user-visible integration defect in the new template-layout behavior. The existing template tests validate persistence and identity remapping, but cannot detect this caller-level mismatch. Manually accept the card-side return action for both newly opened and template-restored islands after correction, including an island with a guarded child.

### R2 — P3: Draft departure intents retain removed message content

**Locations:** `packages/builtin/src/agent/conversation/Drafts.tsx:44–48,98–110,405–408,477–481`.

**Reproduction:** Keep one saved draft in the panel while repeatedly saving and retrieving or discarding other drafts. Keeping a draft present keeps `DraftsBox` mounted.

`markIntent` records a map entry keyed by draft ID. Its signature serializes the complete sender and message parts, including text. The returned cleanup function removes the entry only on failed operations. Successful retrieval/discard has no removal or exit-completion cleanup. Entries for removed drafts therefore survive for the lifetime of the mounted box. Each subsequent intent also copies this growing map. Exchanges can leave signatures for superseded content as well.

**Suggested correction:** Bound intent lifetime to the associated row/content and its departure animation. Either let a focused row-presence wrapper own the departure state or prune completed departures and superseded exchange signatures. Preserve the outgoing intent until Motion has consumed it; immediate pruning solely because the current list no longer contains a row can discard information needed by exit presentation. No timers, generic cache, or generation protocol are needed.

**Release recommendation:** Small, worthwhile pre-release cleanup; not a standalone release blocker. This is actual cumulative retention, but its impact depends on sustained activity while the panel remains mounted. Validate normal retrieval, exchange, delivery, discard, and last-row departure manually after changing presentation ownership.

## Code organization assessment

The changes do not justify a broad pre-release reorganization. Most new behavior follows existing owners, and several extractions already improve cohesion:

- Shared `objectIslandId` gives runtime template persistence and renderer navigation one identity convention.
- `AuxiliaryPanel` owns presence-aware panel rendering, while `ObjectSurface` retains shell and focus responsibilities.
- `IconSwap` shares transition mechanics without interpreting thinking/tool lifecycle.
- Draft content/attachment ownership, exchange recovery, and interaction commands remain distinct from animation presentation. Keep these boundaries when correcting R2 rather than splitting files by size or moving domain operations into animation components.
- Editor wrapping reuses the existing CodeMirror settings compartment and `CodeText` abstraction. A few repeated toggle-control lines do not warrant a new hook or generalized toolbar.
- Storage-name centralization preserves physical names and preparation/recovery membership; no format migration is implied by this cleanup.

One optional maintenance improvement remains in `draft-exchange.ts:11–14,39–42`, `draft.ts:60`, and `interaction.ts:41,107–110`: exchange flags are observed by React indirectly through draft snapshot notifications emitted by `editor.lock(...)`, including unchanged lock values. Current ordering is correct. Document this notification responsibility, or consolidate it into a cohesive interaction snapshot if this boundary is reorganized later. Do not add a second React state mirror or a synchronization effect. This is not an actionable regression or a required release refactor.

No additional confirmed new defects were found in inline feedback visibility and historical handoff, editor wrapping, the reviewed motion/navigation paths, storage-path centralization, or macOS window recreation and runtime retention. This is a scoped source-review conclusion, not a guarantee about untested platform interactions.

## Validation and limitations

Coordinator validation:

- `npm run typecheck` — passed both host and renderer TypeScript checks.
- `npm run build` — passed. The build reported the large-chunk advisory; it was not treated as a new defect without evidence of a regression in this range.
- `npx vitest run src/runtime/templates.test.ts packages/builtin/src/agent/conversation/draft.test.ts packages/builtin/src/agent/conversation/draft-exchange.test.ts packages/builtin/src/agent/conversation/timeline.test.ts packages/builtin/src/agent/feedback-state.test.ts` — 5 files, 39 tests passed.
- `git diff --check v1.0.0-prerelease.14..HEAD` — passed.

Delegated reviewers also ran their owning focused tests; those overlap the 39 tests above and are not additional unique coverage. Vitest emitted the configuration advisory that oxc takes precedence over the configured esbuild JSX option.

No unrelated full history/runtime suite, new tests, GUI interaction automation, packaging, update-installation flow, or cross-platform execution was performed. macOS close/reopen/quit behavior was traced through source, including unsaved-edit confirmation and transport cleanup, but not interactively reaccepted. Visual and platform behavior remains subject to user acceptance.

## Disposition at filing

R1 and R2 are open. No fixes or separate deferred tasks have been created. Resolve R1 before release; prefer addressing R2 in the same cleanup pass. The optional exchange-notification observation does not require a release task. Archive this review when its findings have an explicit disposition.

## Resolution — 2026-11-06

The user authorized both fixes in one separate commit. Both actionable findings now have an implementation disposition:

- **R1 fixed:** The workbench closes object islands through `IslandStrip.close` by identity, rather than assuming direct canvas ownership. The screen's existing closure path still consults guards and includes descendants. Template data and ownership semantics are unchanged.
- **R2 fixed:** `AnimatedDraftRow` owns one departure intent instead of a box-level map. Motion retains the wrapper during exit, then unmounts it with the intent. An exchange that changes the content signature clears the old intent during render; failed operations still withdraw the corresponding intent. No completion timers or mirrored exchange state were introduced.
- **Optional exchange-notification observation:** No refactor is scheduled. The current notification ordering remains correct, and this observation does not warrant a separate deferred task.

Post-fix validation passed: `npm run typecheck`, `npm run build`, the same five focused test files (39 tests), and `git diff --check`. Existing build chunk-size and Vitest oxc/esbuild advisories remain. No UI tests were added for component lifetime or direct command forwarding, consistent with repository test policy.

Manual acceptance remains outstanding for newly opened and template-restored islands returning to cards, guarded child-island closure, and draft retrieval/exchange/delivery/discard/last-row animations, including reduced motion. No GUI automation or platform execution was performed. Archival records the findings' disposition, not completed visual acceptance.
