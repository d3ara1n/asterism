# Extend built-in Agents

The built-in public API lets plugins integrate with existing Agents without importing their implementation. The integration owns its business state and external relationships; builtin owns input admission, conversation history, and Agent execution.

## Extend the domain you need

Use the public Agent boundary when the work belongs in an existing Agent conversation. A plugin that needs its own execution model can instead compose host capabilities without adopting that conversation model.

Import original contracts from the domain package. Shared declaration identity lets an extension participate in existing behavior; a copied schema or an implementation import is not an equivalent integration. Depending on the public API also means depending on its enabled implementation provider.

## Make messages readable and attributable

Sender attribution explains where input came from independently of the Agent that receives it. It is not authority to access the source or a guarantee of a reply route. Preserve that distinction when bridging external systems or forwarding another Agent's message.

Keep the body useful as ordinary readable text. For example, a pull-request notification can state the repository, change, author, and URL. The integration understands those facts and should explain them; the receiving Agent's instructions supply its responsibilities. A domain event does not need a private machine payload disguised as a message.

Use retained attachments when the message must preserve submitted bytes. Use file references when the message should carry an address for later consumption. Forwarding an address does not mean its content has been read or captured.

## Choose admission and scheduling intentionally

Successful submission means that input was accepted, not that the Agent completed the requested work. Design acknowledgements and external status updates around that distinction.

Choose steering for information intended to affect current work and follow-up delivery for a subsequent task. An updated fact and a new independent review may deserve different scheduling even when they came from the same sender. Do not assume one submitted message corresponds to one model request or one turn.

Retain the complete submission for a retry, including its identity and attribution. A retry asks about the same work; changing the body or sender while keeping its identity obscures that meaning. New work needs a new submission identity.

Cancellation of the submission and cancellation of the Agent's independent execution are different decisions. Bind an object-owned bridge to its resource lifetime, but do not treat the disappearance of a sending interface as an implicit request to stop the recipient.

## Keep creation independent of input

Creating an Agent establishes an object; submitting input asks it to work. An integration can create an Agent now and submit ordinary input later. A starting interface may combine both in one transaction without inventing a separate first-message protocol.

Put required initialization in creation or prepared initial work. Observe creation facts for reactions after commitment, not as a blocking initialization hook. Resource presence is a lifetime concern: reconstruction can make an existing Agent present again without creating a new Agent.

## Route through explicit relationships

The publishing integration chooses recipients. A bridge can use its direct links to find Agents without obtaining their private state or inheriting their access to other resources. The reverse link is a separate relationship.

An SDK event is a transient notification, not an Agent message. Translate it into readable input only when the integration's purpose calls for that. This keeps transport, recipient policy, and conversation meaning with the layer that understands each one.

Communication resources should reuse public operation contracts when the semantics match while owning their own addressing and membership. Capture recipient authority at the request boundary; read mutable descriptions when handling the operation. A member directory informs routing without granting access beyond that scope.

## Distinguish admission, evidence, and execution

Use input preparation to inspect, replace, or reject a proposed submission. Keep it tied to a business rule and free of mutations that assume acceptance: preparation is not proof that the submission committed.

Acceptance is useful for integrations that acknowledge received work. Conversation records are evidence of input actually delivered to history. Queued input can remain editable or be discarded, so those observation points answer different questions.

Turn-end notifications describe execution boundaries, not an immutable seal on the conversation or a promise of future idleness. Use the reported input and history position to identify the work rather than assuming the live session tip still represents that ending. Failure, cancellation, and normal completion should remain distinct in downstream status.

Transient notifications suit live reactions. Durable reconciliation needs saved evidence. An observer runs after facts have committed and cannot replace admission or take control of turn scheduling.

## Investigate without continuing the target

A saved-conversation investigation explains evidence without starting a turn on the target Agent. It is useful for status or review questions that should not become new instructions to that Agent.

Keep the evidence snapshot separate from the caller's follow-up conversation. Each investigation can read fresh evidence while the caller retains earlier questions and reports as context. Preserve incomplete outcomes so a follow-up does not mistake a cancelled report for a complete account.

## Prepare context without claiming authority

Request preparation changes the skills and instruction blocks presented to an Agent. Use it for integration-specific context, not as a replacement for authorization. Omitting information from a prompt is not an access restriction.

Keep preparation deterministic within the captured request environment. Changes to configuration or catalogs belong to later requests rather than altering the meaning of a request already being assembled.

## Extend presentation without owning execution

Use presentation extensions for the integration's controls and business state while preserving builtin's conversation and execution ownership. A view closing does not complete or cancel waiting backend work. Reopening should read the current state rather than depend on an earlier component instance.

When presenting history, distinguish immutable evidence from live progress and retry activity. A generation failure can coexist with useful earlier output or completed tool effects. Show what the evidence supports instead of assigning one blanket status to all preceding work.
