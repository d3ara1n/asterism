# Manage data and lifecycle

Choose storage from the meaning of the data. Latest values, historical facts, immutable bytes, and running processes have different lifetimes.

## Separate current state from history

Current data records the latest session or object value. Historical records preserve facts needed to understand or reconstruct past work.

Saving a current value does not automatically create history. Moving to an earlier history position does not restore that value. A resource that supports restoration defines the facts and operations that make restoration meaningful.

Plugin-wide private data belongs to the plugin. Temporary interface choices belong to a view or an object-retained view scope, according to how long they should survive.

## Commit and observe

Use the host's bound read and execution capabilities. Complete network and file processing outside synchronous transactions, then commit the resulting state.

A historical snapshot fixes what is observed. A later write acts in the current execution context. Holding a snapshot does not redirect later writes into the past.

Transient events announce change. A consumer needing current state establishes its subscription and reads the current value; later notifications prompt another read.

## Retain file content

Stage immutable bytes through the content service, then store their reference in persistent data or a record that owns them.

A reference identifies content. Copying its identifier does not by itself grant access or retain the bytes. Pass it through the supported operation scope so ownership remains explicit.

## End asynchronous work

Bind shared services to the plugin lifetime and object-owned instances to the resource lifetime. Register cleanup when creating the owned work.

Cancellation requests that work stop. Wait for actual completion before releasing what that work still uses.

Timeline-dependent operations need the host's activity tracking so history changes and object removal can respect active work.

## Evolve stored data

Persistent file formats need explicit preparation when they change. Keep that preparation independent of ordinary service startup.

Historical records retain their original payloads. Supporting an older shape through decoding is different from rewriting the original historical fact.
