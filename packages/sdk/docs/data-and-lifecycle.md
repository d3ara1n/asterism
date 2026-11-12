# Manage data and lifecycle

Choose storage from the meaning of the data. Latest values, historical facts, immutable bytes, and running processes answer different questions and need different owners.

## Separate current state from history

Current data answers what is true now. History explains what happened. Saving a current value is not a promise that browsing history will restore it; restoration needs a domain operation with a defined meaning.

For example, a counter can keep its latest value while recording each increment for explanation. A document editor may instead need a restorable body at each revision. Decide which experience the resource promises before choosing its records and current data.

Keep plugin-wide private data with the plugin. Keep temporary interface choices with the view unless users need them to survive reopening. A running process is neither saved data nor a historical fact: it needs a live owner and cleanup.

## Treat encoding as a domain boundary

Use a codec when the value plugin code works with differs from its stored representation. Keep conversion semantics with that declaration rather than scattering normalization through readers and writers. A one-way input transformation and a reversible storage conversion solve different problems.

Check meaningful round trips for custom conversions. In particular, reading an old representation and writing a new one should preserve the domain value even when their JSON differs. Compatibility decoding can make an old fact readable without rewriting what was originally recorded.

Separate host identity and presentation from business state. A domain field named “title” need not be the card title, and a domain identifier need not be the host resource identity. Conflating them makes renaming and reuse surprising.

## Decide what a template can reuse

A data-copy template is appropriate when selected saved values remain meaningful under new host identities. A note can reuse its body; an Agent can reuse configuration without carrying pending work into a new session.

Treat copying an address differently from cloning what it addresses. A resource that depends on an external account, embedded object identities, or private files may need an explicit domain-specific cloning operation instead of a data-copy template. Such an operation can explain what will be shared, copied, or reconnected.

Choose titles according to the same distinction. Preserving a descriptive source title can help users recognize a reusable setup; generating a title can make sense when each instance represents new work.

## Commit facts, then observe them

Complete network and file processing outside synchronous transactions, then commit the resulting state. Keep the commit focused on the facts that must become visible together.

Use a pending operation record when consumers need to know about work before its result exists. Its identity represents one operation from published input to final outcome. Keep progress transient unless it has lasting domain meaning, and assign responsibility for ending abandoned work to the owner that started it.

A snapshot fixes the evidence being read; it does not redirect later writes into the past. Reuse one snapshot for related queries when their conclusions need a common basis. Obtain a fresh one when the question is about current state.

Notifications are prompts to observe, not substitutes for saved state. A state-driven consumer should subscribe and read the current value, then reread when notified. An occurrence-driven consumer must decide whether missing an event during downtime is acceptable or whether the domain needs durable records.

## Read history through its owner

Import the original public record contract rather than interpreting another domain's JSON by convention. Shared decoding keeps the meaning and compatibility policy with the author who owns the fact.

Unreadable evidence is different from absent evidence. Preserve that distinction when reporting or deciding whether to recover. A failed transfer is also not an empty query result. An interface should expose those differences rather than presenting an apparently complete account.

Distinguish a creation fact from current presence. Reconstructing an object while browsing history does not mean it was just created. Use historical observation to react to committed facts and attachment lifetimes to own work while a resource is present.

## Choose between an address and preserved bytes

A file reference is an address interpreted by its source resource. It is useful when a consumer should decide whether and when to read external content. Passing the address does not preserve a version of that content.

Retained immutable content is appropriate when a record, attachment, or export must continue to mean the same bytes. For example, a reference to a working file suits “review the current draft”; a retained attachment suits “explain the draft that was submitted.”

Content identifiers alone are not ownership or access. Preserve retained references in the saved encoding, and transfer ownership before closing temporary content scopes. A reference synthesized only while decoding cannot preserve bytes that were never retained.

## End work with its owner

Bind shared services to the plugin lifetime and object-owned work to the resource lifetime. Register cleanup when creating the work, while its ownership is clear. Pass cancellation into the I/O it controls and wait for actual completion before releasing dependencies that work still uses.

Use timeline activity tracking for work whose writes depend on the current history position. An external service may need to stop when its resource disappears without otherwise preventing history navigation. Choose based on that dependency, not merely on whether the operation is asynchronous.

Prepare changes to persistent file formats independently of ordinary service startup. Historical compatibility, current-state migration, and live service initialization have different failure consequences and should remain understandable separately.
