# Agent response recovery and history presentation

Filed: 2026-11-02
Status: Implemented; GUI acceptance pending

## Approved behavior

A model request consumes projected conversation history and produces a new response group. Existing groups keep their identities. Response completion metadata describes termination, including failure and cancellation; it is not sent back as conversation input and is not a blanket validity flag for every block in that response.

Use block-level recovery. Preserve complete, usable output when another part of the same response fails. Exclude unfinished text, thinking, and tool arguments from model input. Preserve complete tool calls whose results are unavailable and pair them with an explicit unavailable-result explanation. Keep the existing workbench-event ordering and tool call/result correspondence. Normalize trailing thinking at assistant boundaries, including before subsequent user/context input, without introducing speculative validation of upstream normal responses.

Publish executable tool inputs in model order before running the tool batch, using the existing operation-record begin/complete mechanism. Complete each record once when its result arrives. A pending historical tool call is a static input preview, not an invitation to execute it. Preserve the preview identity acquired during the original request.

Keep AI SDK retries disabled. Expose upstream failure classification at the model boundary. The builtin Agent owns a finite retry policy: at most three additional attempts, cancellable exponential backoff with jitter, and valid Retry-After support. Network/HTTP/provider-stream failures are eligible even if an intermediary reports authentication or balance errors. Local preparation, software failures, explicit cancellation, and tool execution do not trigger whole-request replay. Each retry is a new request assembled from the current path under the existing request-capture contract; no fabricated user message, old-response completion, or partial JSON continuation is introduced. Upstream restrictions on assistant prefills remain visible as upstream errors.

Errors with output are retained in the response termination metadata on the last model-ordinal block. Errors before any output remain transient feedback and do not manufacture empty history blocks. One notice presents a response error; retry waiting and attempt state use the existing live status location.

UI presentation preserves existing Markdown and plugin content. Shared projection decisions drive an outer shell: dashed means content did not fully participate in subsequent context (excluded content or missing-result completion); error color denotes a relevant failure. Complete usable blocks are not marked erroneous just because their response later failed. A text block has an invisible normal border and shows its shell only for a dashed or error state. Details belong in notices rather than new labels inside plugin views. Thinking boundary exclusion uses shared pure rules rather than separate backend/frontend heuristics.

## Implementation

- [x] Extend model termination and failure contracts; retain raw diagnostics and available metering.
- [x] Publish tools before execution and complete their operation records once, preserving generation order and preview identity.
- [x] Normalize execution history contracts for all readers, including context, diagnostics, subagents, and timeline.
- [x] Share block participation and assistant-boundary thinking rules; pair missing tool results explicitly.
- [x] Add finite builtin retry orchestration and live retry status, preserving cancellation and preventing tool replay.
- [x] Render persistent/transient notices through the existing notice view and apply shared state shells to text, thinking, and tools.
- [x] Update affected SDK examples and independently readable engineering/manual documentation.
- [x] Run focused deterministic contract tests, typechecks, localization checks, and build; leave GUI acceptance to the user.

## Validation cases

- Multiple tools publish in model order; reversed execution completion fills the original records without moving their positions.
- Saved tool input remains inspectable without an outcome; projection supplies an unavailable result without executing the tool.
- A completed text block survives a later stream error; incomplete blocks do not enter model input.
- Thinking exposed by interruption or rewind is removed at relevant assistant boundaries, including before new user/context input; UI derives the same participation decision.
- Upstream errors are classified independently of HTTP status retry allowlists; local errors and cancellation are not retried.
- Retry decisions, delay calculation, and Retry-After interpretation are checked as deterministic logic rather than real-time tests.
- Failure metadata survives history reads when output exists; no-output failures create no artificial block.

## Scope boundaries

No dependency installation, live provider requests, real-data cleanup, commits, or remote writes are part of this implementation. Existing historical payloads must remain readable without editing user data. Provider-specific acceptance of arbitrary retained prefixes is not guaranteed by this change; actual upstream rejection is reported through the same bounded retry/error mechanism.

## Validation and acceptance

Both TypeScript configurations pass, localization checking reports complete English/Chinese declarations, and the production build passes. Execution, adapter, Agent projection, conversation-state, subagent, and SDK integration suites were checked; subsequent focused runs cover all corrected expectations and added cases. No GUI launch or live provider request was used.

Independent review identified two concrete gaps, both resolved and covered with in-memory Anthropic transport fixtures: EOF after a closed text block remains retryable, and provider-reported input/cache usage survives both an error event and premature EOF. Output usage remains unknown until reported during generation or at completion. Local SDK encoding exceptions remain non-retryable.

Follow-up review adjustments: missing tool results distinguish calls never handed to execution (not executed) from calls submitted without a recorded result (effects unknown, e.g. after a crash or a failed result write). Cancellation is checked before tool inputs are published. Existing histories now project complete but unexecuted tool calls with an explicit result instead of dropping them, so a continued older conversation can receive different context than before. Retry classification stays broad because relays rewrite upstream HTTP statuses. Error color is limited to request failures; tool execution failures keep only their status badge.

Manual acceptance should check the invisible normal text outline, dashed/error outlines, frozen historical tool input previews, and retry countdown in the existing live status position. These visual behaviors have typecheck/build coverage but have not been manually accepted.
