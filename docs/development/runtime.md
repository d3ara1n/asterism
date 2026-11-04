# Agent runtime and model execution

The built-in Agent owns conversation projection and the execution loop. The loop controls request iteration and turn boundaries through supplied conversation and execution operations. Its workbench integration owns persistent drafts, timeline records, compression storage, and presentation.

Host model services perform individual requests and tool batches from explicit messages and executable tools. Session-bound execution separately captures an access owner's environment and binds the shared resource dispatcher. Multiple conversations can use one access owner without sharing message state or a model-request singleton. The caller supplies each response's conversation position; the model service treats it as opaque correlation.

## Messages and attribution

An Agent input is a message with ordered text, stored-file, or file-reference parts and one of three sender kinds: user, Agent, or resource event. Resource plugins format event facts as readable text. All three sources share admission, persistent drafts, history records, and execution; sender kind does not select a scheduling path.

Input record provenance identifies the receiving Agent. Sender attribution separately identifies a user, a communicating Agent, or an emitting resource. Agent and event senders retain a resource reference and the sender name captured with the input. Trusted plugin code supplies this attribution; the Agent Send tool derives it from its bound caller. Source attribution does not grant resource access or establish a reply route.

Model projection wraps Agent and event messages in escaped source envelopes while preserving user text. UI reads the original body and structured sender. Work requests, compaction, and history investigation use the same source semantics. Provider message roles are an encoding detail: the adapter can encode all three input sources as user-role messages without changing their domain attribution.

Stored-file parts supply immutable bytes to a model request. File-reference parts project as address data and retain their original resource source across communication routes. Sending, accepting, rendering, or editing a reference does not resolve it. A tool that consumes a reference requests bytes from the source independently of Agent message delivery.

SDK events are typed transient notifications. A plugin callback may translate one into an Agent event message, resolve recipients, and submit it. Event publication and resource links do not themselves submit messages or start an Agent loop.

## Turns and input scheduling

A turn groups the inputs an agent handles together. A request is one model response and its tool batch. Blocks are output units, not turn boundaries.

The first input in a turn carries `startsTurn`; subsequent inputs in the batch and steering inputs do not. Stop, failure, and explicit continuation retain the turn. A new idle submission or the next batch consumed at a turn boundary begins another turn.

Input submission is an Agent action. Retries retain the submission identity and complete input. An already accepted identity is ignored; preparation may still run before admission detects that duplicate.

Agent creation establishes an empty resource and configuration independently of message submission. Builtin's Home entry composes creation with ordinary input acceptance in one transaction. It runs the same registered input preparers before committing the session, resource, and message together; failed preparation leaves no empty session. The initial title is derived from the accepted input. This atomic assembly introduces no separate first-message lifecycle or notification.

Idle input commits before execution. While running, accepted inputs enter the persistent Agent drafts collection. Drafts retain full parts, sender, and mode, but are not model context until delivered.

Boundary consumption follows these rules:

- After a response and its tool batch, consume steering inputs in draft order before capturing the next request.
- At a normal or error turn boundary, consume steering and follow-up inputs in their shared order as the next turn.
- Cancellation leaves drafts and modes intact.
- Deliver messages and remove their drafts in one transaction, including content ownership transfer.
- A history commit failure stops execution rather than starting a request with unrecorded input.

Restoring drafts on startup does not send them. The Agent owns scheduling and runs one consuming loop at a time; host activity tracking also covers cleanup after a loop stops consuming.

The workbench Agent has no request count or execution time limit; a turn continues while responses request tools or steering arrives. Agent configuration budgets apply only to subagent runs.

Builtin uses bounded automatic recovery for upstream model failures before tool execution. The adapter identifies eligible failures at the transport or provider boundary; HTTP authentication and billing errors remain eligible because intermediaries can misclassify upstream failures. Local preparation and processing failures, explicit cancellation, and tool execution do not trigger model replay. Consecutive recovery attempts have a finite budget and cancellable backoff that honors valid provider delay headers. Subagent request and duration budgets also bound recovery.

Each retry is a new request projected from the current history and captures its own environment. Completed usable blocks remain input; incomplete blocks do not. Recovery does not fabricate a user message or continue an unfinished JSON argument. Provider restrictions on the resulting conversation remain visible as upstream errors. The Agent's live activity represents requesting, generating, tool execution, and waiting to retry.

## Observation boundaries

Input preparation is independent of loop startup. Idle input, steering, follow-ups, and Home's first input all pass through the same action preparers. Preparation can replace or reject an attempt and is distinct from committed acceptance.

The Agent publishes input acceptance only after the new submission and its deduplication identity commit. The notification contains the final prepared input and whether it was queued. Home publishes after the outer session-creation transaction, not from its nested input write. Duplicate submissions and failed acceptance publish nothing.

Actual delivery is the append of an Agent input message record. Session record observers see idle delivery during acceptance and queued delivery at a request or turn boundary. Event subscriptions and record observers are separate mechanisms; receipt notification is not a prerequisite for observing an already committed record.

Turn-end notifications are emitted after the runtime decides whether another turn will run. They include the outcome, turn-opening input identity, ending history position, and a settled flag. For a continuing loop, the position is captured before the next input batch is appended. For a stopped loop, runtime running state is cleared before publication. Steering and tool continuation do not end a turn.

Failures, cancellation, and failure to start execution also report their outcomes. A notification describes an execution boundary rather than sealing the historical turn; explicit continuation can resume the same input and later report another ending. Settled means this loop has stopped consuming, independently of remaining host task cleanup. Subsequent submissions may start another loop before a subscriber handles the notification.

These are transient builtin domain events with the Agent as source. Plugins subscribe through the ordinary SDK event mechanism without introducing another observer registry. Notification handlers do not participate in scheduling. Operation-record completion and resource status retain their separate meanings.

## Request environment

At each request boundary, capture the message path, agent configuration, model target, credentials, resource links, and execution tool and resource policies. The response and its tool batch use that environment through completion.

Changes recorded during a response affect the next request. Captured access does not freeze external file contents.

Tool caller identity carries the access owner's resource reference and title plus the paradigm-supplied Agent role name when present. A workbench Agent uses itself as the access owner; a subagent uses its pool while supplying its own role name. Resource and top-level tool implementations receive this identity without the Agent's configuration or runtime object.

Resource type policy is enforced centrally by the resource dispatcher. Listing remains resource state discovery. Inspection returns the same state and tool definitions, adding a notice only when the current role is denied. Calls on a denied type return a rejected result before entering the resource tool implementation. Denial feedback names the captured role so a later request under a different role can interpret earlier feedback correctly. Resource policy leaves linked context and top-level tool behavior unchanged.

Each session-bound request acquires shared lifetime holds for its captured directed resource relationships. Independent requests through the same receiver contribute independent holds. Unlink and removal events immediately change history and future discovery. Existing holders keep using the captured instances until their response, tool batch, and cleanup finish. Hold release follows actual completion, including cancellation cleanup.

Request holds do not lock the timeline. The ordinary Agent protects its turn with an object-bound busy task because it writes conversation records. External runtime work can retain resource capabilities without taking that busy scope. Removing the access owner cancels its managed execution; removing an offered resource preserves other owners' captured requests through completion.

The Agent stores selection and activity state, not a second message history. System instructions are rebuilt from the current environment and are not persisted as conversation:

- Infrastructure descriptions explain primitives, inputs, outputs, and request boundaries.
- Agent instructions define its selected role and work requirements.
- Linked-directory `AGENTS.md` files supply current context.
- The skill catalog supplies names and descriptions for selective reading.

Host-authored harness text uses declarative descriptions of primitives. Workflows come from user prompts and skills. User instructions retain their meaning, including negative requirements.

Context selection guides model behavior toward the user's intended work. Omitting a skill from a prompt does not make its files inaccessible, and hiding a tool does not establish an operating system sandbox. Resource identity and captured access still govern the shared resource dispatcher. Shells, terminals, and MCP operate with the configured user's access; prompt preparation does not attempt to police equivalent operations through those capabilities.

Builtin owns structured prompt blocks and their projection. The host model service accepts neutral source/text blocks; session-bound execution supplies captured linked context for the requesting plugin to assemble. Builtin's ordered request preparers can filter skills and edit blocks before projection. Captured blocks provide identity and origin for diagnostics; their text delimiters do not establish an additional instruction hierarchy.

## Skills

The host skill catalog discovers direct child packages under the user's `~/.agents/skills` directory and plugin-declared package directories. Each package declares a name and description in `SKILL.md` YAML frontmatter. Instruction contributions are fixed text registered during plugin setup. The host stamps actual plugin provenance and removes contributions with their owner's lifetime.

Discovery occurs at startup or explicit refresh. The host exposes raw sources and same-source duplicate diagnostics. Builtin selects effective skills with user sources above plugin sources above builtin, resolves plugin conflicts deterministically, and sorts its result by name.

Each request prepares the skill list presented in its prompt. `skill_read` independently resolves names through the current flattened catalog and reads the package's current text. Request preparers control prompt visibility; they do not restrict skill reading. Lexical and resolved paths remain inside the package's real root. Reading returns ordinary tool output; it neither executes scripts nor establishes resource links.

`skill_refresh` rebuilds discovery and reports counts and issues. Later reads use the refreshed catalog, and subsequent model requests present the updated list. File reads expose actual filesystem failures.

## Execution state

Agent state combines its current-path records with the in-memory loop and interruption positions:

| State | Meaning |
| --- | --- |
| Empty | No input on this path |
| Running | The loop is consuming work, including model calls, tools, questions, or compaction |
| Completed | The latest response after input has every ordinal through its successful generation termination, all complete, no tool calls, and normalized stop |
| Incomplete | Input exists but that completion condition is unmet |

Transient failures without output can retain an interruption position and expose continuation. Restart clears that transient state and derives what remains from recorded facts.

Resource busy state and sidebar notifications are separate mechanisms. Neither substitutes for Agent execution state.

Request occupancy prevents history cursor movement but does not itself mark the access owner busy. Resource-owned tasks and actions determine busy state. Model progress reaches the caller's observer; an optional workbench output sink displays only the events the caller sends to it.

## Tools and captured access

Top-level tools register statically during assembly. Resource tools are discovered through the captured links, support relations, and agent policy. Resource changes do not mutate protocol tool declarations during a response.

The host reserves resource listing, inspection, invocation, and script orchestration. Inspection and execution share the captured capability view. A resource call validates target identity, captured access, tool support, target shape, and arguments.

Link notifications carry resource identity, not state or tool definitions. Resources own the state exposed through discovery: listing returns that state alongside identity, while inspection expands the tools available in the captured capability view. The host assembles these results without interpreting resource-specific state fields. Inspection narrows by tool name and by projection depth, and reports an unknown name with the names currently available.

Plugin tool policy filters plugin top-level and resource-tool names. It does not turn the reserved host discovery entries into grants of access.

Tools can declare that execution requires user interaction. Noninteractive environments exclude those tools from declarations and resource inspection and reject calls before entering their implementations. Dual-mode tools receive the environment's interaction capability. Result rendering is independent: a data-producing tool can execute without mounting its view.

Overrides follow configured plugin order. The distribution initially places builtin first in the ordinary package list. Top-level names and resource-tool names resolve independently. A later tool declaration replaces its whole definition; a later implementation replaces the same resource-type/tool pair. Referencing a replaced contract does not reactivate it.

Invalid duplicate identities within a plugin fail assembly. Historical results retain the actual implementation identity selected for that call.

## Tool batches and outcomes

Only a normally completed response with complete arguments starts tools. Truncated or unterminated generation does not execute partial calls.

The host publishes complete tool inputs before starting the batch, then validates, binds invocation context, executes, and delivers outcomes to the caller's record consumer. The consuming paradigm can begin operation records for these inputs and complete them with the outcomes. One request-scoped scheduler accepts direct calls and script child calls. Sequential operations execute in submission order relative to other sequential operations; parallel operations can overlap both parallel and sequential operations. Dependencies require waiting before submitting the dependent call. Independent requests retain independent scheduling scopes. The host waits for the batch to finish before returning the request result. Completion order does not change historical positions or model result pairing.

Progress publishes validated current output without writing history. A final outcome records actual implementation, timing, display data, and model projection. The six outcomes are success, rejection, failure, cancellation, partial result, and unknown effect.

Omitted failure data can retain the last valid progress; explicit null clears it. Late publication after completion has no effect. Unknown writes do not imply rollback.

`toModel` runs at termination. Adapters consume that saved projection, not GUI data. File outputs transfer through content ownership and are delivered for successful or partial outcomes.

Temporary conversations can retain tool attachments in an independent content scope and supply that reader to later requests. Timeline writers and temporary owners acquire their own references before the request handoff closes. Concurrent requests through one access owner have independent handoff holds.

Tool outcomes feed the Agent’s next request; a failed or cancelled tool does not itself terminate the Agent loop. Cancelling the whole Agent propagates through its current work.

## Resource script execution

Resource orchestration evaluates an async JavaScript body in a fresh QuickJS WebAssembly runtime on a worker thread. Local resource handles bind identity, and their methods select existing resource tools without separate declarations or implementations. Method inputs preserve the tool's target and argument contracts. The bridge forwards calls through the ordinary resource dispatcher with its resolution, policy checks, scheduling, and result projection; other top-level tools retain their ordinary argument shape. The sandbox holds JSON values and bridge functions; resource instances and session capabilities stay in the host. Runtime memory is bounded, and cancellation interrupts computation independently of the worker's event loop.

Scripts are noninteractive execution surfaces. Tools requiring user interaction remain available to direct interactive model calls; script bindings omit them, and resource dispatch rejects them before implementation entry. Inspection exposes their interaction requirement. Tools supporting both modes receive the script's noninteractive context while retaining the captured request's other capabilities.

Child results are available to the script as their ordinary structured outcomes, including raw data and model projection. A text helper extracts projected text as a value. The outer model result contains the final returned JSON value or text, or the script's actual failure. Child calls retain identity, timing, terminal outcome, and diagnostic summaries in the outer result, without persisting their arguments or outputs. Progress replaces the current complete summary snapshot; the final snapshot preserves actual outcomes after outstanding calls have been cancelled and settled. Worker, runtime, listeners, and execution timers belong to the script scope. External resources retain their own lifetimes, and completed effects survive script termination.

## Questions and communication

`ask_user` waits after model response completion, without keeping the provider request open. User waiting has no default deadline. View unmount, sleep, and navigation do not answer or cancel it.

Answers validate against the original question identities, types, options, and required fields. Optional skips are explicit. Recommendations do not create a default answer. Cancellation returns a cancelled tool outcome, while stopping the Agent cancels the enclosing work.

Closing a question view differs from cancelling the question. Submitted answers become the saved outcome; drafts stay out of history. Runtime restart need not recover waiting promises.

Agent `send` invokes input admission with host-bound sender identity. Acceptance is distinct from completion. `wait` waits for the target to settle; timing out the wait leaves the target running. Reverse communication requires a reverse link.

Automatic session naming uses actual user input. Agent and event messages retain their own attribution and do not become user requests for naming.

`peek` reads a fixed target-agent history snapshot through an independent utility-model investigation. It does not run the target Agent or inherit its tools. Saved results identify the snapshot, report, query trace, and actual model usage.

## Model input and protocol adaptation

Model input parts are ordered text or stored-file parts backed by immutable ContentRef values. Resource FileRef values reach this layer as projected text, not binary input. The frontend submits the identified media type for stored files; the server determines whether it accepts that input. Request media budgets belong to the model-media implementation.

The adapters support OpenAI Responses, OpenAI Chat Completions, and Anthropic Messages through AI SDK. Tool definitions omit SDK execution handlers, and retries are explicit rather than implicit. Responses requests disable provider storage.

Credential-bearing requests require HTTPS and reject redirects. Unauthenticated connections omit credential headers. Caller identity headers remain separate from model content and resource authorization.

Each request projects public history toward its target model. Native continuation data is reusable only within its recorded provider, protocol, endpoint, model, and adapter-version scope. Crossing that boundary drops inapplicable native data without rewriting history.

Tool call IDs transform deterministically when required, keeping calls and results paired. Protocols unable to encode tool-result files reject them unless an explicit compatibility setting supplies the supported transformation.

Reasoning text and summaries are distinct public data. Protocol-specific signatures and encrypted continuation never replace that text. The reasoning switch controls reasoning participation; explicit off requests disabled thinking, while an unset level leaves the upstream default after inheritance.

## Diagnostics and measurement

Completion extensions attach typed domain data to the response’s actual completion-bearing block. Agent request diagnostics describe the sent system sections and tool names, not replayable prompt bodies or schemas.

System text counts are Unicode character measurements. Provider token usage cannot be apportioned into prompt sections by guessing.

Request timing begins after request preparation and ends at model response termination, excluding subsequent tool work. Monotonic elapsed time supplies durations; wall-clock timestamps identify dates. First and last content offsets include meaningful text, reasoning, and argument increments.

Reported output usage includes reasoning where the protocol reports it. Derived rates and costs preserve unknown values and avoid double counting.

Error details preserve actual messages, response status, filtered headers, response body, and available causes. They omit request credentials and bodies. Generation failures with output are retained in that response's termination metadata; failures without output remain transient feedback. Software processing failures also use application diagnostics. Request errors do not make already completed content invalid. Retryability is an execution fact independent of the diagnostic origin label.
