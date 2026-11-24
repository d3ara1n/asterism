# Review: conversation feedback, process folding, and feature organization

Reviewed `5ee14e46`, `e9050d4e`, and `417c8828`. The primary question is whether a reader can tell what happened and what needs attention without opening routine execution history. The documentation changes are part of the review, not acceptance criteria.

## Findings

### P1 — A completed reply can conceal a blocking execution error

`packages/builtin/src/agent/conversation/conversation-process.ts:33,53–66,72–75`

The last displayed response completing is not the same as the operation succeeding. For example, the controller can report an execution failure after the final model reply when post-response compaction cannot prepare or save its result (`controller.ts:64–67,87–92,181`; `compression.ts:128–133`). With any foldable reasoning or tool output, the error and its details disappear from the default transcript and are represented only by a neutral notice count. A second case occurs when a request fails before emitting a model block and a new input succeeds: the first error can fold into the second input's process because the grouping boundary requires a model block. Preserve blocking feedback at its own input or operation; fold recovered retry noise only when the later success actually resolves it. Do not replace this with a blanket rule that every error must stay open forever.

### P2 — A user-initiated compaction failure is counted as a compaction in an earlier answer

`packages/builtin/src/agent/conversation/conversation-process.ts:53–66`; `packages/builtin/src/agent/conversation/ConversationProcess.tsx:71`

Manual compaction is a separate operation on an idle conversation (`controller.ts:144–157`). Its failed marker is anchored to the existing timeline tail. If that answer has a foldable process, the failure and its diagnostic action become “1 compaction” in the old answer's summary. If the answer contains only final text, the same failure remains visible. The user's ability to see the outcome of the command should not depend on whether a previous answer produced reasoning or tools. Keep standalone command outcomes visible; completed automatic compactions can still be candidates for folding.

### P2 — Restyling warning rows removes their live announcement semantics

`packages/builtin/src/agent/conversation/Notice.tsx:19–24`

The previous `Alert` exposed `role="alert"` for warnings as well as errors. The new warning row is static content with a decorative icon and no live announcement, while the error branch still has `role="alert"`. Audit how newly emitted warnings are announced without replaying historical items when virtualized rows mount. The visual marker can remain compact; this does not require restoring the old alert box. Screen reader behavior was not tested interactively.

### P3 — Shared model choices still have the wrong feature owner

`packages/builtin/src/agent/conversation/configuration/ModelChoices.tsx:12`; `packages/builtin/src/home/Entry.tsx:9`; `packages/builtin/src/agent/creation.tsx:19`; `packages/builtin/src/renderer.ts:36`

`share/` co-locates the flow, its projection, and its tests; keeping the composer draft separate from the drafts panel is also sensible. The conversation toolbar picker belongs in `conversation/configuration/`, but `ModelChoices` has no conversation consumer and is exposed through the renderer entry. The move groups similar filenames without correcting that dependency. Put the shared view in the builtin configuration area; do not promote it to host or generic UI solely because it has multiple callers. This is an ownership improvement, not a runtime regression.

## Documentation disposition

- `docs/development/workbench.md:159`: Do not keep the assertion that a truly blocked group cannot have a completed reply. It is contradicted by the controller and the timeline projection; it also turns a convenient implementation condition into a product rule. Keep the distinction between input groups and execution turns, and document visibility in terms of outcomes readers must discover after the behavior is settled.
- `docs/development/design-system.md:164`: The preceding paragraph already establishes shared status components and local feedback. The new paragraph largely restates this patch's visual choices, and the draft exchange currently uses one `StatusText` warning row, not “the same two forms.” Remove the patch-specific detail; keep a general distinction between inline status and execution notices only if it helps decide future cases.
- `conversation-process.ts:10–15,23` and `conversation-process.test.ts:219,238`: Some added prose repeats the same incorrect completion premise, and the older test comment about compression never participating in folding now contradicts the new behavior. Keep comments that explain boundaries; test independent user-visible outcomes rather than merely recording the current grouping rule.

## Validation

Typecheck, build, localization check, and commit-range whitespace check passed. Focused conversation and feedback tests passed (120 tests), as did the controller tests (16 tests). Three temporary projection probes confirmed the behaviors in the first two findings: error after a completed reply, error before any model block followed by a successful input, and failed compaction with versus without a foldable prior reply. Probes were removed after use. No GUI or assistive-technology acceptance test was run.

## Disposition

Use one positional rule for execution notices and compaction markers: only those between model blocks in the same foldable group can be hidden. Feedback before the first block and after the last block remains inline, including standalone compaction outcomes. Do not add live announcements to the transcript; the failure row no longer uses an alert role. Move the shared model view out of conversation. Limit engineering documentation to guidance for future design decisions; this review is a historical record, not design guidance.
