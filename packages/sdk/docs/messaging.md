# Compose external messaging

External messaging separates a platform connection from the workflows that use it. The provider owns platform communication; consumers decide what incoming information means for their resources and users.

## Share transport, not workflow state

Treat a configured connection as a shared service rather than creating a receiver for every card or session. Platform authentication, protocol recovery, and provider-specific persistence belong with the provider. Each consumer owns its subscriptions and releases them with its own lifetime.

Keep conversation, message, and attachment identities tied to the platform. Several messages arriving together may be related without becoming one message. Preserving individual identity makes later replies, reads, and attachment access unambiguous.

A consumer's read position should not silently become a shared global position. Independent consumers may need different views of the same conversation; query continuation and business decisions about what has been handled are separate concerns.

## Make platform differences explicit

Translate platform behavior without pretending that every service has identical capabilities. Reject unsupported operations explicitly. Distinguish recoverable transport interruptions from conditions requiring user action, so recovery belongs to the layer that can actually perform it.

Attachments need the same care as text. An address to a platform file is not a permanently available download URL. Resolve it through the provider that understands its identity, and preserve cancellation and download failures.

When sending has external effects, resolve required input before beginning delivery. If a platform turns one logical submission into several sends, expose failures honestly rather than implying that partial delivery was atomic.

## Choose when configuration is captured

Resolve a connection at the consumer's request boundary when related operations should use one configuration. Read current external content when handling the operation. Configuration identity and mutable conversation content need not have the same lifetime.

Cancellation belongs to the work it controls. Cancelling one consumer's query should not end a receiver shared with other consumers. Conversely, ending the provider must release the work it owns.

## Translate events deliberately

A messaging event is not inherently an Agent message. A consumer may update a view, record a durable fact, or submit input through a paradigm's public API. The integration owns that choice and the readable explanation of the event.

For example, an issue-tracker bridge can share one platform receiver across sessions while each resource chooses its recipients and records its own processing decisions. The provider understands the platform; the bridge understands the work.
