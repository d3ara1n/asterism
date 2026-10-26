# Agent runtime and model execution

The built-in Agent owns conversation projection and the execution loop. Host model services perform individual requests and tool batches. Session storage owns persistent history, and the host coordinates generic lifecycle.

## Turns and input scheduling

A turn groups the inputs an agent handles together. A request is one model response and its tool batch. Blocks are output units, not turn boundaries.

The first input in a turn carries `startsTurn`; subsequent inputs in the batch and steering inputs do not. Stop, failure, budget exhaustion, and explicit continuation retain the turn. A new idle submission or the next batch consumed at a turn boundary begins another turn.

Input submission is an Agent action. Exact retries use the same submission identity and complete input; reusing that identity for a different action or input fails.

Idle input commits before execution. While running, accepted inputs enter the persistent Agent drafts collection. Drafts retain full parts, sender, and mode, but are not model context until delivered.

Boundary consumption follows these rules:

- After a response and its tool batch, consume steering inputs in draft order before capturing the next request.
- At a normal, error, or request-budget turn boundary, consume steering and follow-up inputs in their shared order as the next turn.
- Cancellation leaves drafts and modes intact.
- Deliver messages and remove their drafts in one transaction, including content ownership transfer.
- A history commit failure stops execution rather than starting a request with unrecorded input.

Restoring drafts on startup does not send them. The Agent owns scheduling and runs one consuming loop at a time; host activity tracking also covers cleanup after a loop stops consuming.

The request limit counts work requests, not user turns. Its default and budget constants belong to source. Steering does not reset it; a new turn or explicit continuation does. There is no blanket Agent execution timeout.

## Request environment

At each request boundary, capture the message path, agent configuration, model target, credentials, resource links, and tool policy. The response and its tool batch use that environment through completion.

Changes recorded during a response affect the next request. Captured access does not freeze external file contents.

The Agent stores selection and activity state, not a second message history. System instructions are rebuilt from the current environment and are not persisted as conversation:

- Infrastructure descriptions explain primitives, inputs, outputs, and request boundaries.
- Agent instructions define its selected role and work requirements.
- Linked-directory `AGENTS.md` files supply current context.
- The skill catalog supplies names and descriptions for selective reading.

Host-authored harness text uses declarative descriptions of primitives. Workflows come from user prompts and skills. User instructions retain their meaning, including negative requirements.

Structured prompt blocks provide identity and origin for rendering and diagnostics. Their text delimiters do not establish an additional instruction hierarchy.

## Skills

The built-in skill service discovers direct child packages under the configured sources. Current assembly uses the system user’s `~/.agents/skills`. Each package declares a name and description in `SKILL.md` YAML frontmatter.

Discovery occurs at startup or explicit refresh, not on every request. The shared catalog sorts effective skills by name. Duplicate names in one source are ambiguous; when multiple sources are supplied, later sources override earlier ones.

`skill_read` resolves a name from the loaded catalog and reads current text within that package. Lexical and resolved paths remain inside its real package root. Reading returns ordinary tool output; it neither executes scripts nor establishes resource links.

`skill_refresh` rebuilds discovery and reports counts and issues. Subsequent requests use the new catalog.

## Execution state

Agent state combines its current-path records with the in-memory loop and interruption positions:

| State | Meaning |
| --- | --- |
| Empty | No input on this path |
| Running | The loop is consuming work, including model calls, tools, questions, or compaction |
| Completed | The latest response after input has every ordinal through its completion, all complete, no tool calls, and normalized stop |
| Incomplete | Input exists but that completion condition is unmet |

Transient failures without output can retain an interruption position and expose continuation. Restart clears that transient state and derives what remains from recorded facts.

Resource busy state and sidebar notifications are separate mechanisms. Neither substitutes for Agent execution state.

## Tools and captured access

Top-level tools register statically during assembly. Resource tools are discovered through the captured links, support relations, and agent policy. Resource changes do not mutate protocol tool declarations during a response.

The host reserves `resource_list`, `resource_inspect`, and `resource_call`. Inspection and execution share the captured capability view. A resource call validates target identity, captured access, tool support, target shape, and arguments.

Plugin tool policy filters plugin top-level and resource-tool names. It does not turn the reserved host discovery entries into grants of access.

Overrides follow user plugin order, with the built-in plugin first. Top-level names and resource-tool names resolve independently. A later tool declaration replaces its whole definition; a later implementation replaces the same resource-type/tool pair. Referencing a replaced contract does not reactivate it.

Invalid duplicate identities within a plugin fail assembly. Historical results retain the actual implementation identity selected for that call.

## Tool batches and outcomes

Only a normally completed response with complete arguments starts tools. Truncated or unterminated generation does not execute partial calls.

The host validates, binds invocation context, executes, persists outcomes, and waits for the batch to settle before the next model request. A batch containing sequential tools preserves order. Parallel completion order does not change model result pairing.

Progress publishes validated current output without writing history. A final outcome records actual implementation, timing, display data, and model projection. The six outcomes are success, rejection, failure, cancellation, partial result, and unknown effect.

Omitted failure data can retain the last valid progress; explicit null clears it. Late publication after completion has no effect. Unknown writes do not imply rollback.

`toModel` runs at termination. Adapters consume that saved projection, not GUI data. File outputs transfer through content ownership and are delivered for successful or partial outcomes.

Tool outcomes feed the Agent’s next request; a failed or cancelled tool does not itself terminate the Agent loop. Cancelling the whole Agent propagates through its current work.

## Questions and communication

`ask_user` waits after model response completion, without keeping the provider request open. User waiting has no default deadline. View unmount, sleep, and navigation do not answer or cancel it.

Answers validate against the original question identities, types, options, and required fields. Optional skips are explicit. Recommendations do not create a default answer. Cancellation returns a cancelled tool outcome, while stopping the Agent cancels the enclosing work.

Closing a question view differs from cancelling the question. Submitted answers become the saved outcome; drafts stay out of history. Runtime restart need not recover waiting promises.

Agent `send` invokes input admission with host-bound sender identity. Acceptance is distinct from completion. `wait` waits for the target to settle; timing out the wait leaves the target running. Reverse communication requires a reverse link.

Input record provenance identifies the receiving agent; structured sender data identifies who sent the message. Model projection uses an escaped sender envelope, while UI reads structured data. Naming uses real user input.

`peek` reads a fixed target-agent history snapshot through an independent utility-model investigation. It does not run the target Agent or inherit its tools. Saved results identify the snapshot, report, query trace, and actual model usage.

## Model input and protocol adaptation

Input parts are ordered text or immutable file references. The frontend submits the identified media type; the server determines whether it accepts that input. Request media budgets belong to the model-media implementation.

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

Error details preserve actual messages, response status, filtered headers, response body, and available causes. They omit request credentials and bodies. Model failures appear as transient conversation feedback; software processing failures use application diagnostics. Neither creates synthetic history.
