# Delegated execution foundations

Filed: 2026-10-29.

## Scope and implementation

This record explains the execution boundaries established while preparing Asterism for subagents. It describes implemented infrastructure and the remaining feature boundary. It does not establish a subagent tool, scheduler, background delivery protocol, or audit retention policy.

Ordinary Agents now use the same request and tool machinery that a later temporary conversation can use. The host has no subagent-specific resource type or disposal rule.

## Shared resources, independent conversations

An execution's conversation, access owner, and output destination are separate concepts. A session-bound request uses the real access owner's current directed links and plugin/session bindings. Its message input and output observer are supplied independently. Multiple requests can share an access owner without sharing conversation state or a per-resource request singleton.

Tools operate on actual resources. Editing a note changes that note; editing a file changes that file. Context isolation does not create a private copy of the world. Resource tools receive their real target object, while top-level tools receive the real caller/session binding. Registered tool implementations retain their original plugin services.

The requested subagent direction is explicit task material without parent-conversation inheritance, and exclusion of creation discovery and creation tools (`creation_list`, `creation_inspect`, `resource_create`). The existing top-level tool policy can express those exclusions. Those tools are not fixed host entries. The fixed entries are `resource_list`, `resource_inspect`, and `resource_call`. These constraints do not establish the future delegation protocol.

## Directed request holds

Each session-bound request captures current owner links and acquires a shared hold through each captured directed relationship. The registry counts independent holders by receiver and offered-resource identity. It does not inspect Agent types or traverse parent/child Agent trees. Existing links do not themselves hold resources; execution does.

The request releases its holds after its response, tool batch, and request cleanup have finished. Cancellation requests termination; release follows actual completion. Separate requests through one owner can start and finish at different times. A request through another receiver contributes to a separate directional count.

Unlink and remove events commit immediately. History is the source of current logical presence and links, so subsequent requests cannot acquire the removed relationship. Existing requests continue through their captured tool environments.

The workbench supplements current history with transient hold state:

- A disconnected relationship with outstanding holders is displayed as a dashed directional link and its hold count.
- A removed resource awaiting its held relationships or cleanup is displayed as an inert dashed card, with no count on the card.
- Relationships without holds disappear immediately.
- Pending display does not restore model access or enable resource interaction.

Instance disposal waits for incoming and outgoing holds to drain, then ends remaining object-bound work and attachment cleanup. Request-held tools can record actual effects after the removal intent. History remains ordered by actual commits.

The registry uses the existing endpoint-pair identity. Reattaching that direction makes it currently available again; outstanding holders from earlier requests remain counted until release. The earlier detach event remains in history. This avoids introducing a new persistent link identity or rendering two copies of the same active directional relationship.

## Busy, request occupancy, and shutdown

Resource-owned busy work and request occupancy have different purposes. Busy work retains the existing removal restriction for that resource. Session-bound requests independently block history cursor movement and hold captured relationships; borrowing an owner's access does not automatically declare that owner busy.

Resource retirement also blocks cursor movement until cleanup completes. This prevents a prior identity from being reattached while its previous instance is still retiring. No resource generation counter is needed for this coordination.

Archival cancels session-bound work, waits for current and retiring instances, and then marks the session archived. Application shutdown stops managed execution and waits for cleanup through the existing runtime shutdown path. The main process still has its existing forced-stop deadline; complete external cleanup is not guaranteed after forced termination.

On restart, runtime holds and pending display do not exist. An already-recorded removal keeps the resource absent. Explicitly selecting a historical path on which the resource exists can reattach it under ordinary history semantics; that differs from restarting on the removal path.

## Execution APIs and responsibility

`plugin.models.run` is a typed single-request runner. Its inputs are model configuration, instructions, messages, supplied executable tools, cancellation, and an observer. It produces normalized blocks and tool results while preserving supported continuation information, usage, timing, response metadata, and diagnostics. It neither requires a workbench resource nor validates a conversation position against a session cursor. That position is opaque correlation supplied by the consumer.

`plugin.execution.run` binds one request to a real access owner. It synchronously captures resource links, tool policy, interaction capability, and resource holds, then supplies bound tools and linked context around the model runner. It accepts optional input and output content ownership for independent conversations.

Progress reaches the observer. `plugin.execution.withProgress` is a separate optional workbench output sink. The Agent integration chooses which events reach it; a future subagent can instead publish a small progress projection through its outer tool call or retain no visible progress.

Builtin's extracted Agent loop controls request iteration, turn boundaries, budget handling, and termination. Its port supplies request execution, completion work, and input consumption. The ordinary Agent integration retains draft scheduling, timeline projection and append, persisted compression, feedback, and resource activity. The extraction follows this real consumer rather than introducing a universal Agent framework.

## Interactive tools

Tools declare `requiresInteraction` when they require a user interaction endpoint. Session execution supplies `interactive` to top-level and resource-tool implementations. Noninteractive requests filter interaction-required tools from declarations and resource inspection, and reject forced calls before starting their implementations.

Dual-mode tools can select behavior using the supplied capability. A renderer that displays progress or results does not itself require interaction. `ask_user` declares the requirement; resource creation's future exclusion from delegation is a separate behavior policy.

## Skills and temporary content

`skill_read` resolves names through the current flattened skill catalog and reads the selected package. Prompt preparation controls what is presented, not reading permission. Agent-ID-to-request-list binding is removed. External file failures propagate through ordinary file handling.

Temporary content scopes retain attachments independently of timeline records. Session execution can transfer tool outputs into such a scope before its request handoff closes; later requests use the scope as their input reader. Concurrent request handoffs through one owner retain content independently. Persistent results or audit storage must acquire ownership before a temporary scope ends.

## Remaining subagent feature work

Foreground and asynchronous delegation need a single feature design covering input contracts, role/model selection, final-report delivery, cancellation ownership after the originating tool returns, audit storage, attachment retention, and initial/resource-change context projection. Background owner removal, cross-turn result delivery, and optional visible progress belong to that design rather than being inferred from resource access identity.

The next phase is continued brainstorming. The existing execution and content APIs are reusable infrastructure, not a completed subagent runtime design. An implementation sequence should follow the behavior and ownership decisions, rather than treating the candidate composition as already approved.

No role-based resource-type restrictions, automatic recovery, queue fairness policy, or autonomous workflow orchestration are introduced by these foundations.
