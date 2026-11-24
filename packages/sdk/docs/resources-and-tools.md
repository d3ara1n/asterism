# Design resources and tool calls

A resource is an object with identity and lifetime. A tool is an operation a model can choose. Keep them independent so the same operation can work across different objects without making them share a domain model.

## Decide which capability should be callable

Use a resource when the work has a recognizable subject with its own state or lifetime. Keep model-facing state with that resource; it should let a model recognize the subject and its relevant condition. A card presents the object, but hiding it neither ends its work nor revokes links.

Expose a tool when a model needs to choose and perform the operation. When application code already knows what to do, use the owning domain service or typed action rather than routing through a model. Share the same business logic behind these surfaces. Choose a resource tool for work on a linked object; choose a top-level tool for work on the execution context or shared lifecycle that has no such subject.

## Design the call around intent

Reuse a public tool contract when its meaning and shared input are the same across resources. A structured read, for example, can express the same operation while each implementation decides how to address its own content and views. A different effect or meaning deserves a different contract, even if it uses similar code. Name the operation for what the caller is asking it to do.

Choose structured input when the model must supply independent choices or when a distinct target makes resource-specific selection clearer. Choose freeform when the whole input belongs to one text syntax, and validate that syntax at the operation boundary. An operation that takes text and independent options can still be structured. Keep provider-specific encoding out of the domain contract.

Design for discovery: explain the purpose, required context, result, and how its outputs can be used next in the tool's own guidance and schemas. Explain the absence of a result or an uncertain effect where it changes the caller's next decision. A short write receipt should report what changed, not repeat the input or the display diff. The model should be able to call the tool without having read this manual.

## Keep execution with its owner

Treat links, tool discovery, and permission to execute as separate facts. A visible card or known address is not authority; a reverse link is independent. Bind access and configuration at the request boundary, but read ordinary mutable content when handling the operation.

Order operations according to their dependencies rather than whether they read or write. Require interaction only if a user's response is necessary to complete the work. Keep progress separate from durable results, and distinguish rejection, cancellation, partial completion, and uncertain effects. Stopping a caller does not undo completed effects.

## Compose and verify calls through their actual surface

Use session-bound execution when a model should work through the session's links and real resources. Use direct model execution when the caller supplies its own messages and executable tools without a workbench object. The caller owns conversation policy, recording, and retry decisions; session access alone does not make work depend on the current history position.

Start at the target SDK's public declarations and follow a similar tool from registration to dispatch and result projection in the application source. Verify what discovery actually shows and run the operation through its intended caller, not just its handler. Check invalid input, inaccessible targets where relevant, and whether the result gives the caller enough evidence to continue without guessing or repeating an effect.
