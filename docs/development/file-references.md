# Resource file references

File references connect content producers and consumers without moving bytes through message payloads. They are SDK infrastructure usable in plugin calls, events, persistent data, and model-facing operation arguments. Agent messaging is one consumer of the data type.

## Address and resolution

A reference carries the full source resource identity and a JSON locator owned by that resource implementation. The host uses the identity to route consumption; the provider interprets the locator and streams bytes. Consumers use a common interface without depending on the source's locator format.

References are public, self-contained, and freely constructible. Possession of a valid address is sufficient to request content. Resolution checks that the source exists and has a provider, then delegates the actual read. There is no issued-reference registry, signature, propagation tracking, or additional consumer authorization. Resource tool dispatch retains its own operation contracts.

Sessions supply resource identity and data independently of their UI surfaces. Cross-session consumption uses the source session in the reference. Transferring a reference through another resource preserves that source.

## Consumption and lifetime

Creating, listing, publishing, saving, or forwarding a reference performs no content read. Consumption opens a pull stream at the source. The host carries cancellation and closes the provider iterator when consumption ends, fails, or is abandoned. Cancellation rejects consumption rather than reporting partial bytes as a complete file. Providers own their I/O and cleanup.

The host does not cache content. Providers determine how to acquire their bytes; the directory provider reads the current file each time. A missing source, unavailable provider, missing file, or read failure is reported when consumed. File descriptions are observations and do not guarantee later content or availability.

History preserves reference data without retaining or restoring the external content it identifies. Immutable content references remain a separate mechanism for stored bytes and their ownership. A consumer needing a durable copy makes that copy as part of its own operation contract.

## Models and operations

A file-reference message part presents the address and descriptive metadata to the model as text. It does not become a binary model input. Direct Agent and Mesh sends preserve these parts without opening them.

A captured model file can also carry the FileRef it was fetched from. Projection supplies both the immutable file content and an operable address; interface rendering presents one attachment. Resource tool results retain content already owned by the resource as well as newly staged content through the same tool-result hold. User exports consume either captured content or a resource reference through a stream and replace the selected destination only after the transfer completes.

Each operation decides whether it accepts file references and how it consumes them. Reference support does not imply automatic adaptation of text writes, file previews, or other operations. Models select and pass addresses; plugin code can transfer them through the same typed data contracts without involving a model.

The shared reference schema describes source identity and locator semantics. Producers identify their returned values as FileRef; consumers identify the parameters accepting FileRef. Operation descriptions depend on this shared contract without introducing particular producers, discovery routes, or consumers.
