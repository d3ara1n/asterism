# Design plugin views and settings

Views present state and accept input. Backend services own the work, results, and resource lifetime. That boundary lets an interface close or remount without changing the meaning of independent work.

## Match presentation to ownership

A resource card presents an object; an operation view explains one attempt to do something. An input preview may still be incomplete and is not evidence that execution began. Present final outcomes according to what actually happened, including partial effects or failure.

Use host presentation for containment and navigation. Keep the plugin's domain content within it instead of rebuilding the surrounding application. Localize the view's styling so one plugin does not redefine another's interface.

## Give expanded views a meaningful identity

An island is an expanded plugin surface with its own view lifetime. Choose its identity according to what users consider the same open work. A shared settings editor may need one instance; editors for different resources or sessions need distinct identities.

Base a saved editor's identity on the saved object, not an unsaved identifier field. A creation draft and a persisted object have different identities even if a user names the object “new.” After saving, normalize the draft from the accepted result rather than continuing to display a merely proposed value.

Opening a child view does not give it the source component's context or durable ownership. Pass the domain identity it needs explicitly and reconstruct its state from the appropriate owner. Protect unsaved edits when closing or navigating away; do not confuse a close guard with cancellation of independent backend work.

Cancellation should mean something specific to the task. An editor can abandon a draft, while a running export may need to stop I/O. Decide that outcome rather than treating every dismissal gesture as permission to terminate a service.

## Make locations reconstructable

A resource owns the meaning of its locations and the surfaces used to display them. Prefer a location that supplies enough domain context to reopen the same content without depending on a previous component's memory.

A reference names something; it is not an access grant or proof of current availability. Resolve it when followed and report the actual result. Keep navigation initiated by a user distinct from a model request's captured authorization scope.

Opening a file should preserve its meaning as file content. Text inside it does not become another application interaction contract merely because the viewer can recognize a link-like string.

## Keep transfers with the right owner

Use immutable retained content when a preview and an export must refer to exactly the same bytes. A file reference is more appropriate when the intent is to resolve content at consumption time. Make that choice before presenting the transfer as a saved result.

The view owns pending indicators and feedback for a transfer it starts. Its cancellation signal should stop that transfer, not unrelated readers or the resource's independent services. Treat an unavailable source or failed transfer as a failure, not as empty content.

## Separate settings drafts from shared configuration

A settings page owns its edit draft and interaction state; the backend owns shared configuration. Closing the page ends view subscriptions, not every service affected by the settings.

Choose managed configuration for schema-validated settings. Other domain data may need a different persistence model. Avoid treating every editable value as configuration simply because it appears on a settings page.

## Offer commands as focused interactions

Use the application palette for actions and controls that are useful without opening a full editor. Decide whether an inapplicable action should be absent or whether a temporarily unavailable action should remain visible with a reason.

An asynchronous command owns its pending and failure state. Close its interface when the intended result is known, not merely when work was dispatched. Backend work still uses the plugin's ordinary communication and authorization boundaries.

For example, a compact-row preference and a reset action should address the same preference. The palette is another interaction surface, not a second store. A real control should own its input interaction rather than masquerading as an action row.

## Keep language independent of work

Localize interface explanations without changing protocol identifiers, user content, or raw diagnostics. Changing the UI language should not reset drafts or running operations. Keep translation choices in presentation rather than making business state depend on rendered text.
