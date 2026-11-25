# Own data and work over time

Choose storage and lifetime from what a value means. Current values, historical facts, preserved bytes, and running processes answer different questions and have different owners.

## Choose what to preserve

Current data answers what is true now. History explains what happened. A counter might keep its latest value and record each increment; a document editor might promise a restorable body at each revision. Make restoration an explicit domain operation rather than promising it just because something is recorded.

Keep plugin-wide data with the plugin and transient interface choices with the view. Keep business state separate from host identity and presentation. A domain field called “title” need not be the card title, and a domain identifier need not be the host resource identity.

A template copies setup that remains meaningful under new identities. It may reuse a note's body or an Agent's configuration, not their running work. Decide which saved values should carry over and what a copied address shares rather than clones. Decide whether a new object needs the original title or one derived from the new task.

## Commit facts, then observe them

Finish asynchronous preparation before committing related facts together. If an operation must be visible while pending, give it one durable identity from submission to final outcome. Keep progress transient unless it has lasting domain meaning.

A snapshot fixes the evidence being read, not the destination of future writes. Reuse it for related queries that need a common basis. Notifications are prompts to observe: read current state for a current-state consumer, and use durable facts if missing an event during downtime changes the result.

Read another domain's history through its original public contract. Unreadable evidence is not absent evidence. Restoring an object's current presence does not mean it was just created; observe committed creation facts for historical reactions and attachment lifetimes for present work.

## Evolve a saved format without changing the fact

Use a codec when the current stored representation differs from what domain code should see. Check that round trips preserve meaning. If a distributed encoding needs to change, prefer a startup migration over keeping old encodings in the codec, even when those encodings are easy to decode. A migration converts the saved data before plugin setup so ordinary readers and writers need only the current format.

Declare migrations for plugin-private JSON and SQLite files and for groups of owned timeline contracts in the plugin's storage entry with `defineStorage`. A record migration does not upgrade current session data, saved templates, or another plugin's records. If the meaning changes rather than just the encoding, give the new fact a new contract instead of rewriting the old one to mean something it did not.

Version private formats independently of session history. A record group is for owned timeline contracts that must evolve together. Keep its identity and membership stable; do not move existing contracts between groups or assume a changed member inherits the correct version. Convert only the recorded data, using rules tied to the old format rather than today's business defaults. Preserve source, position, and the content the fact retains. Migration changes the persisted format; readers remain responsible for interpreting and validating the content. Do not revise past decisions, recreate resources, or repeat external effects.

Test the conversion with a real old-format fixture and an expected encoding. Include records on alternate paths and retained content when relevant. Check that a second startup leaves the prepared data unchanged and that an interrupted or failed upgrade has a recovery path. Do not assume independent stores upgrade as one transaction; the plugin may remain unavailable while a previously prepared store is already on the new version.

## Separate addresses from preserved bytes

Use a file reference when the consumer should decide whether and when to read current external content. Use retained content when a record or export must still mean the same bytes later. Passing an address does not preserve a version or confer access.

Keep retained references in the saved encoding and transfer ownership before closing temporary scopes. A reference synthesized only when reading cannot preserve bytes that were never retained.

## End work with its owner

Bind shared services to the plugin and object-owned work to the resource. Register cleanup at the point of ownership, pass cancellation into the I/O it controls, and wait for actual completion before releasing dependencies.

Track timeline activity when work depends on a history position. A service may otherwise need to stop when its resource disappears without preventing history navigation. Choose based on that dependency, not simply because an operation is asynchronous.
