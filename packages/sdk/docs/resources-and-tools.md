# Design resources and callable capabilities

A resource represents an object with identity and lifetime. A tool represents a model-callable operation. Keeping them independent lets the same operation work across different objects without forcing those objects into one domain model.

## Choose the object boundary

Use a resource for something that belongs in a session and can be recognized or operated on independently. Give it responsibility for its state, model-facing projection, and object-owned work.

A card is a presentation of that object, not its backend lifetime. Hiding a card should not silently end work that remains meaningful without it. Conversely, retaining saved data is not a reason to keep a live process running.

Ask for disposal confirmation when ending a live instance has consequences the user should decide about. Base the warning on work that actually exists, not on saved state that could hypothetically be restored. Warning discovery and cleanup have different purposes.

## Design information and access separately

A resource's model-facing state should let a model recognize the object and understand its relevant condition. Keep that projection with the resource implementation rather than relying on the host to interpret private saved state. Tool definitions explain operations; they are not a substitute for object state.

Directed links express availability to a receiver. The reverse relationship is independent, and a path through another object is not implicit access. A readable title, reference, or member directory does not grant authority over the object it names.

For example, a bridge can choose recipients from its direct links without acquiring their private business state. Read current relationships when handling a new external event; a model request already in progress uses its captured scope.

## Choose a callable boundary

An application action or service call need not be a model tool. Expose it when a model needs that capability, and keep the implementation's business logic shared with other callers where appropriate.

Reuse a tool declaration when the operation has the same meaning and shared arguments across resources. Keep resource-specific selection with the implementation. A distinct meaning deserves a distinct contract even when its code happens to resemble another operation.

A read operation illustrates the distinction: reading keeps its meaning while a resource decides how content is addressed and which view is useful. Name operations by that meaning, not by the file or package that happens to declare them.

Use a top-level capability for operations on the execution context or shared resource lifecycle, rather than inventing a placeholder resource solely to host them.

## Put invocation knowledge in the contract

Tool descriptions, guidelines, and schemas must support use independently of the manual. Explain purpose, how outputs relate to later inputs, input meaning, result interpretation, and execution boundaries in the owning contract.

Use examples to clarify data flow without prescribing a workflow. Describe an operation's own use of a file reference rather than assuming which resource produced it or which consumer follows it. Distinguish failure, cancellation, partial output, and uncertain effects when those differences affect what a caller can conclude.

Choose scheduling according to ordering requirements, not simply whether an operation reads or writes. Require interaction only when completion depends on a user response; showing progress alone does not make backend work interactive.

## Compose model execution deliberately

Session-bound model execution is useful when a request should act through a resource's links and real session. Direct model execution suits work whose messages and executable tools are supplied by the caller without a workbench object. Choose based on the access and history relationship, not on a presumed requirement to create an Agent.

Capture configuration and authorization at the request boundary. Read ordinary mutable content when handling an operation. For a resource addressing a selected network, this keeps the meaning of its addresses stable through the tool batch without pretending the network's content is frozen.

The caller owns conversation policy, historical recording, and retry decisions. Keep transient progress distinct from durable operation results. A generation failure does not necessarily mean that every earlier tool effect failed or that repeating the request is safe.

Resource access and timeline activity are also separate. Work that depends on a history position needs the appropriate activity scope; merely holding access to a resource does not establish that dependency. Temporary conversations need explicit ownership of attachments that must survive into later requests.

## Separate services from their interfaces

A backend capability does not automatically need a resource card or a model tool. Typed calls, events, and sustained channels serve different interaction needs; choose them according to whether the consumer requests a result, observes a change, or maintains a live connection.

For example, a one-shot shell process and a persistent terminal need different owners. Cancelling a command concerns that process; closing one terminal view need not end a shell shared with other views. Host services supply the execution mechanics, while the plugin chooses the domain object, presentation, and callable interface.
