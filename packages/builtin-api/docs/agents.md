# Extend built-in agents

The built-in public API lets plugins submit messages to existing Agents and extend their preparation and presentation. The contributing plugin owns its integration and business state. Builtin owns input admission, conversation history, and Agent execution.

## Declare the dependency

Declare `@asterism-app/builtin-api` and `@asterism-app/sdk` in `peerDependencies` with `"*"`. The SDK is supplied by the host; the enabled builtin plugin provides its public API package. The host does not gate loading on dependency ranges. For local development, source-package dependencies supply editor types. Import public contracts from the domain package so every participant uses the same declarations. Disabling builtin also makes its dependent plugins unavailable.

Examples are TypeScript and TSX fragments for a plugin's backend or renderer. They use public packages; install additional libraries imported by the chosen example, such as Nano ID for submission identities, in the plugin project. A plugin still supplies its manifest and composition entry points.

## Messages and their sources

An Agent input is a message with ordered text or file parts and a structured sender. All messages use the same submission action, history record, queue, and body renderer. The sender has three variants:

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

Construct the complete input once and retain it for retries, including the submission ID, sender name, mode, and body. Reusing an accepted ID with identical input does not duplicate delivery. Reusing it with changed input fails. File parts use content references with explicit read eligibility; pass the appropriate content source with the action when forwarding files.

Cancellation of a submission is separate from cancellation of the Agent's independent execution, which has its own public action. Stopping an Agent preserves pending drafts. Restoring drafts on application startup does not automatically send them. Creating an Agent also does not start execution; submit a message to begin its work. The builtin Home entry creates a session with an initial user message.

## Resolve recipients

The publishing plugin selects recipients and submits messages explicitly. A bridge resource can read a fresh session snapshot for resources directly linked to itself, select Agent references, and invoke their input action. Each link makes a resource available to its receiver; the reverse relationship is independent. Reading a link does not expose another plugin's private state.

The SDK event bus delivers typed transient notifications to subscribers. Publishing there does not submit an Agent message. A callback can translate a notification into a readable event message and submit it to selected Agents. This translation belongs to the integration that understands the notification.

## Implement communication resources

Use the public Send, Peek, GetProfile, and SetProfile tool declarations when a resource provides those operations. Each resource implementation owns its addressing schema and resolves targets within its authorized scope. A shared tool name does not grant direct access to the addressed Agent or its linked resources.

For cross-session messaging, obtain the target session executor and submit through the same Agent input action. The public Agent service supplies an Agent's configured type and investigates its saved records without exposing private Agent state. Investigation captures a fixed record snapshot and does not start a turn on the target. Forward cancellation and investigation progress to the caller.

Mesh messages retain their internal sender attribution in history. Model projection uses the channel name, Agent name, and numeric disambiguator; a sender not exposed to the channel is marked as not visible. Communication resources own their member directory and task descriptions. Resolve targets against the request's captured access scope. Read current task descriptions when handling an operation; identity resolution and mutable profile text have separate lifetimes.

## Prepare incoming input

An external preparer can inspect, replace, or reject any of the three message sources using the original built-in action contract. Its replacement supplies raw action input that will be parsed again. Preparation has read capabilities and does not commit session mutations.

Keep a preparer's scope tied to its business purpose. It does not replace the Agent implementation or acquire a private Agent executor.

## Prepare model requests

The host collects skill packages and instruction blocks with their registering plugin's provenance. Builtin selects its effective skills and builds structured instruction blocks for each request. User skills override plugin skills, which override builtin skills.

Declare an Agent preparer to filter skills or remove, change, and append instruction blocks. Preparers run synchronously in plugin initialization order. Each request captures the catalog and preparer set before awaiting linked context, then uses the prepared result for its prompt. `skill_read` resolves names independently through the current flattened catalog. Removing a skill from the prompt does not restrict reading it; a catalog refresh affects later reads and model requests.

## Extend presentation

Register Agent UI extensions during frontend preparation and bind registration to its cancellation signal. Extensions can present controls, supplemental content, overlays, or modal interaction using the built-in presentation components. Message sources already share the built-in body renderer and source presentation.

The plugin supplies business state for the associated Agent and callbacks for user actions. A component becoming invisible does not complete or cancel waiting backend work. Remounting should reread current state, and each submission entry owns its pending and error state.
