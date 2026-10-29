# Design the subagent experience

Filed: 2026-10-29.

## Status

This is a brainstorming agenda, not an approved feature design or an implementation checklist. Phase one supplied reusable execution infrastructure. Foreground and background subagent behavior still needs discussion, alternatives, and explicit decisions before implementation is planned.

## Intent established so far

The intended subagent receives task material explicitly, has an independent conversation, and works on real resources through its owning Agent. It is not a workbench Agent resource or a separate Asterism session. Parent-conversation inheritance is not wanted. Its internal transcript belongs to audit storage rather than the main conversation timeline, and its final response supplies the report.

Background execution may outlive the originating tool call and the main Agent's turn. Subagents cannot create resources: the subagent module must exclude `resource_create` and `creation_*` when supplying their tools. This exclusion expresses the subagent feature's scope, not an interaction requirement on those tools. Existing resources remain usable. Role configuration and broader tool policy remain open for the design phase.

An Agent may launch multiple background subagents. Each needs independently managed execution state, including its temporary conversation, running work, and attachments, so concurrent subagents can be tracked and managed separately. Each conversation supplies model context and accepts output blocks independently of the main Agent's timeline projection. Audit archival preserves the chosen record when execution ends. Container names, data structures, and APIs remain open; background ownership, result delivery, and attachment retention still need to be designed together.

These goals constrain the discussion; they do not define the final tool API, ownership protocol, or storage design.

## Available phase-one foundations

- `models.run` executes explicit typed messages and tools without workbench identity.
- `execution.run` captures an access owner's current resources per request and retains directed holds through completion.
- Agent loop control is separated from the ordinary workbench controller.
- Noninteractive execution filters interaction-required tools; dual-mode tools receive the capability explicitly.
- Temporary content scopes retain attachments across requests without timeline records.
- Observers receive execution output, and workbench progress is an optional destination.

These are existing capabilities to evaluate and compose. Their availability does not prescribe the subagent architecture.

## Questions for brainstorming

- [ ] What task material should delegation accept, and how should role/model selection work? Distinguish task instructions, background information, and attachments.
- [ ] How should existing role configuration and the owner's tool policy combine? Which restrictions serve an actual requirement, and which responsibilities belong in role instructions?
- [ ] What owns a background execution after the initial tool call returns? Define cancellation separately for the tool call, owner turn, owner resource removal, session archival, and application exit.
- [ ] How should foreground waiting and background results work together? Compare explicit retrieval, completion notifications, and automatic owner wake-up without assuming one is the default.
- [ ] What report and execution information should survive normal completion, failure, cancellation, or budget exhaustion? How should an unfinished result differ from a final answer?
- [ ] What audit record is useful, where should it live, and how long should it and its attachments remain? Decide what is retained before choosing a file format.
- [ ] How should initial resources and later access changes enter the independent conversation? Compare concise initial projections and ordinary discovery without copying parent messages.
- [ ] Does visible progress help, and what should it show? A tool name, a compact status, and no visible progress are candidates rather than settled requirements.
- [ ] When can a subagent's temporary state be released, and who owns the report and attachments afterward? Consider foreground and background delivery together.

## Expected outcome of the design phase

Produce a coherent behavior model with concrete examples, an explicit ownership/cancellation model, and the chosen model-facing and user-facing contracts. Record tradeoffs and unresolved questions. Only then turn the accepted design into implementation work and targeted validation cases.

No queue policy, polling tool set, automatic wake-up behavior, recursion policy, audit layout, or subagent UI has been selected by this record. Workflow orchestration remains the user's responsibility unless a concrete product requirement changes that scope.
