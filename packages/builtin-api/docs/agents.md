# Extend built-in agents

The built-in public API lets plugins submit messages to existing Agents and extend their preparation and presentation. The contributing plugin owns its integration and business state. Builtin owns input admission, conversation history, and Agent execution.

## Declare the dependency

Declare `@asterism-app/builtin-api` and `@asterism-app/sdk` in `peerDependencies` with `"*"`. The SDK is supplied by the host; the enabled builtin plugin provides its public API package. The host does not gate loading on dependency ranges. For local development, source-package dependencies supply editor types. Import public contracts from the domain package so every participant uses the same declarations. Disabling builtin also makes its dependent plugins unavailable.

Examples are TypeScript and TSX fragments for a plugin's backend or renderer. They use public packages; install additional libraries imported by the chosen example, such as Nano ID for submission identities, in the plugin project. A plugin still supplies its manifest and composition entry points.

## Messages and their sources

An Agent input is a message with ordered text, stored-file, or file-reference parts and a structured sender. All messages use the same submission action, history record, queue, and body renderer. The sender has three variants:

| Source | Meaning | Attribution |
| --- | --- | --- |
| `user` | Input from the user | No additional sender fields; this is the default when sender is omitted |
| `agent` | Communication from another Agent | Communication resource reference and Agent name, with optional Mesh channel addressing |
| `event` | Facts reported by a resource | Emitting resource reference and its name when the message is constructed |

Plugins supply sender attribution from their integration context. An Agent's Send tool obtains it from the bound caller. The saved input record belongs to the receiving Agent; its sender identifies the origin independently. Attribution itself grants no access to the source resource or reply route.

Keep the body useful as ordinary readable text. A resource reporting a pull request can include its repository, number, title, author, commit, and URL. The Agent's configured instructions supply its responsibilities. Event type names and domain facts belong in the body; no separate event payload schema or renderer is required.

Builtin preserves the submitted body and sender in history. Model projection wraps Agent and event messages in escaped source envelopes. The UI renders the original body with source identification: Agent messages use the Agent name, while event messages use the resource name, event icon, and blue surface. Names remain those recorded with the message even if the source is later renamed or removed.

## Submit and schedule messages

Obtain the target session executor from the plugin context and invoke `SubmitAgentInput` with the Agent resource reference. Each submission includes a 16-character Nano ID, parts, a delivery mode, and its sender. External callbacks can invoke the same action without a model tool call. Use a resource's attachment lifetime for an object-owned connection and pass its signal into ongoing submissions.

An idle Agent records accepted input and starts execution. When the Agent is running, accepted input enters its persistent drafts collection. Delivery mode is independent of sender:

| Mode | Delivery while running |
| --- | --- |
| `steer` | At the next request boundary, after the current response and tool batch |
| `follow` | At a turn boundary, together with other pending inputs eligible for the next turn |

For example, a new independent review can use `follow`, while updated facts for the current task can use `steer`. A turn may consume a batch of messages; submission does not promise a separate turn for each message. Successful submission means acceptance, not completion of the Agent's response.

Construct the complete input once and retain it for retries, including the submission ID, sender name, mode, and body. An already accepted submission ID is ignored rather than accepted again. A new message needs a new ID.

Stored-file parts (`kind: "file"`) supply immutable content to the model and require the appropriate content reader when forwarded through an action. File-reference parts (`kind: "file-reference"`) carry a `FileRef` in `ref`, with optional `filename` and `mediaType`. They pass through actions, events, drafts, and history as ordinary JSON. Model projection presents their addresses as text; receiving or resending one does not read its bytes or require a content reader.

Cancellation of a submission is separate from cancellation of the Agent's independent execution, which has its own public action. Stopping an Agent preserves pending drafts. Restoring drafts on application startup does not automatically send them.

## Creation and input

Agent creation and message submission are independent operations. Creating an Agent establishes an empty resource with its configuration; it does not require a message or start execution. Plugins can create the resource and submit ordinary input later.

The builtin Home entry combines session creation, Agent creation, and acceptance of a user message in one transaction. It prepares the input before committing the new session, so rejected input leaves no empty session behind. The message uses the ordinary input contract, preparers, and acceptance notification. There is no separate first-message event or plugin lifecycle stage.

Creation-related work belongs to resource creation or observation of the resulting creation fact, independently of incoming messages. In a session observer's `committed` callback, use the SDK's `ResourceCreated.decodeAll(records)` and select known entries whose `data.type` equals `Agent.kind`. The associated Agent ID is `data.id`; the host-created record's source is null. A creation observer sees the committed state; Home's creation and input may already be present together. Observation is not a blocking initialization hook. Resource-presence notifications and attachment lifetimes describe entry into the current resource set, including reconstruction, rather than only new creation.

## Resolve recipients

The publishing plugin selects recipients and submits messages explicitly. A bridge resource can read a fresh session snapshot for resources directly linked to itself, select Agent references, and invoke their input action. Each link makes a resource available to its receiver; the reverse relationship is independent. Reading a link does not expose another plugin's private state.

The SDK event bus delivers typed transient notifications to subscribers. Publishing there does not submit an Agent message. A callback can translate a notification into a readable event message and submit it to selected Agents. This translation belongs to the integration that understands the notification.

## Implement communication resources

Use the public Send, Peek, GetProfile, and SetProfile tool declarations when a resource provides those operations. Each resource implementation owns its addressing schema and resolves targets within its authorized scope. A shared tool name does not grant direct access to the addressed Agent or its linked resources.

Send accepts ordered `parts` containing text and file references. Each file-reference part carries a `FileRef` in `ref`; its optional `filename` specifies the name used for delivery. Agent and Mesh implementations forward these parts into Agent input without resolving the references. A consuming implementation can stream a referenced file through `plugin.files.open(ref, { signal })`. The original source resource remains in the reference across sessions and intermediate senders. The consuming operation determines how to use the bytes; support for references is explicit in each operation's contract.

For cross-session messaging, obtain the target session executor and submit through the same Agent input action. The public Agent service supplies an Agent's configured type and investigates its saved records without exposing private Agent state. Investigation captures a fixed record snapshot and does not start a turn on the target. Forward cancellation and investigation progress to the caller.

Mesh messages retain their internal sender attribution in history. Model projection uses the channel name, Agent name, and numeric disambiguator; a sender not exposed to the channel is marked as not visible. Communication resources own their member directory and task descriptions. Resolve targets against the request's captured access scope. Read current task descriptions when handling an operation; identity resolution and mutable profile text have separate lifetimes.

## Prepare incoming input

An external preparer can inspect, replace, or reject any of the three message sources using the original built-in action contract. Its replacement supplies raw action input that will be parsed again. Preparation applies to idle input, queued steering and follow-ups, and Home's initial input. It runs before acceptance, including on retries, so it is not an acceptance notification. Preparation has read capabilities and does not commit session mutations.

Keep a preparer's scope tied to its business purpose. It does not replace the Agent implementation or acquire a private Agent executor.

## Observe input and turn boundaries

Input preparation, acceptance, and delivery are separate observation points. Use a preparer to modify or reject a submission. Subscribe to `AgentInputAccepted` to react after a new input commits. Its payload contains the final prepared `input`, including `submissionId`, and `queued`, which reports whether it entered drafts instead of being delivered immediately. Rejected inputs and retries of accepted submissions produce no new acceptance event. Home publishes acceptance after its complete session-creation transaction succeeds.

Saving a held draft or changing an existing draft's mode is a draft-state operation, not a new input submission. These operations do not emit acceptance events; record observers still see the draft if it is delivered.

Observe `AgentInputMessage` through `SessionObserver.committed` to see actual delivery to conversation history. Queued messages produce this record when consumed; idle inputs produce it during acceptance. Steering records do not start a new turn. These records and acceptance events use separate delivery mechanisms; an idle input's record is committed before its acceptance event is published. Acceptance does not guarantee that a queued message will reach a model request: pending drafts remain editable and can be discarded.

Subscribe to `AgentTurnEnded` for execution boundaries. Every ending carries `reason` and `settled`. A normal turn followed by another queued batch reports `settled: false`; the last turn reports `settled: true` after the loop stops consuming. Failure and cancellation are reported with their own reasons rather than as successful completion. Steering joins the current turn and does not produce an ending by itself.

The event's `inputId` identifies the turn-opening input record, and `position.nodeId` identifies its ending history position before any next-turn inputs. `inputId` can be null when execution has no recorded turn input. By the time a handler runs, the live session may contain later records; use these identities to locate the reported work instead of assuming the current tip is that ending. A stopped turn can be resumed explicitly and emit another ending for the same input. The event does not seal history or promise that the Agent will remain idle.

Both events are transient occurrence notifications on `plugin.ipc.events`, with the receiving Agent as their resource source. Subscribe for all Agents or filter by session and resource identity, and bind subscriptions to the plugin lifetime. A plugin does not need its own resource to subscribe. Handlers run asynchronously and do not participate in input admission or turn scheduling. `settled` describes the consuming loop, while host task cleanup may still be tracked independently. Events are not replayed after restart.

`SessionObserver.completed` concerns finalized operation records; it is not a turn-end callback. Resource status events describe coarse workbench status. Use the Agent's domain notifications when input identity, turn position, or the distinction between turn end and loop end matters.

## Prepare model requests

The host collects skill packages and instruction blocks with their registering plugin's provenance. Builtin selects its effective skills and builds structured instruction blocks for each request. User skills override plugin skills, which override builtin skills.

Declare an Agent preparer to filter skills or remove, change, and append instruction blocks. Preparers run synchronously in plugin initialization order. Each request captures the catalog and preparer set before awaiting linked context, then uses the prepared result for its prompt. `skill_read` resolves names independently through the current flattened catalog. Removing a skill from the prompt does not restrict reading it; a catalog refresh affects later reads and model requests.

## Extend presentation

Agent history includes immutable model blocks and tool operations. Complete tool inputs are published before execution and their results fill the same record once. Read both through the public execution decoder when building a history projection; operation completion updates the existing record rather than appending a new tool position.

Response termination metadata may describe generation failure or cancellation as well as success. It belongs to the response's last model-ordinal block and does not invalidate all earlier content. Errors before any output remain transient. Retry activity belongs to current execution state, not historical notices.

Register Agent UI extensions during frontend preparation and bind registration to its cancellation signal. Extensions can present controls, supplemental content, overlays, or modal interaction using the built-in presentation components. Message sources already share the built-in body renderer and source presentation.

The plugin supplies business state for the associated Agent and callbacks for user actions. A component becoming invisible does not complete or cancel waiting backend work. Remounting should reread current state, and each submission entry owns its pending and error state.
