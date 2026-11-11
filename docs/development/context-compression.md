# Context compaction

Compaction is built-in Agent policy. It summarizes an older input prefix while retaining recent original material and leaving recorded history unchanged.

## Budget and boundaries

The Agent checks its context budget between work requests and after a final response. Automatic triggering applies the configured window reserve; manual compaction bypasses that threshold, including when the window is unknown. Both paths use the same retention policy and summary operation. Compaction does not consume a work-request count.

Budget estimation prefers the current model’s most recent eligible reported input usage, then estimates additions. After compaction, usage from before the summary is no longer an eligible anchor. Unknown windows do not trigger automatic compaction.

Reported input already includes cached tokens. Character estimates are not persisted as reported usage and do not promise exact multimodal token counts.

Select a retention boundary between complete projected units. Keep response blocks and their tool outcomes together, including interleaving created by projection. A long turn can retain from a complete response inside it.

No legal summarizable prefix means no forced deletion of recent text.

## Execution ownership

Compaction is a context-only interlude. The summary operation neither starts an Agent loop nor controls turn boundaries. Automatic compaction runs inside the existing loop's task and cancellation scope; returning from it leaves continuation to that loop.

The independent compaction entry requires a settled Agent, whether its last turn completed or remains incomplete. The controller checks that condition and registers its task synchronously, so the condition applies to backend callers as well as interface commands. An existing conversation or compaction task rejects another independent start. No eligible prefix is a normal no-op without a model request.

Manual compaction owns a managed task and shares the Agent's busy state and stop action. It does not consume drafts, emit a turn-ended event, or resume conversation execution afterward. Input accepted during it remains queued. Success, failure, and cancellation preserve the preceding conversation's turn state; cancelling this interlude does not record a turn interruption.

## Summary request

Use the same conversation model and its current thinking level through a one-shot stream with no tools. An off level omits reasoning parameters so the upstream default applies, because some models have no disabled mode; other levels use the same encoding and compatibility mappings as work requests. The output limit is the model's configured limit. The summary system prompt is independent of the ordinary harness, Agent role, and linked context files.

Material distinguishes user messages, Agent messages, and resource event messages using the work request's source envelopes. It also identifies assistant replies, tool calls/results, and context. It omits private continuation data and thinking; file descriptions identify references without claiming to have read the files.

The summary preserves goals, constraints, decisions, progress, unresolved work, necessary identities, and relevant skill references. Consequential inputs retain their source kind and the Agent or resource address and name; event facts remain attributable to their source. Verified facts, suggestions, and unverified claims retain distinct status. Repeated compaction updates the previous summary with newly summarized material.

## Persistence and projection

A successful summary appends an ordinary Agent summary record with its retained boundary, model, prior estimate, and actual completion data.

The summary's append position and its retention boundary are distinct. Later model projection selects the latest matching summary by contract and emitting Agent, validates its boundary against timeline metadata, and reads original bodies from that retained boundary. Request origins can precede the retained interval and remain validated against the complete metadata path. When a retained response starts before the boundary, its intervening positions are also read to verify that the cut preserves complete projected groups. An unreadable latest summary fails explicitly instead of falling back to an earlier one.

Moving before the summary excludes it. A damaged or invalid boundary fails explicitly instead of silently trimming history.

Compaction activity and failures are transient view feedback. The saved summary establishes history; a view can keep its current reading window independently.

## Failure and cancellation

Empty output, incomplete streams, truncation, unexpected tools, and model errors retain the original projection and mark the transient compaction activity as failed with the error details. Cancellation does not commit a partial summary.

A persistence failure stops execution; it is not treated as a harmless summary-generation failure.
