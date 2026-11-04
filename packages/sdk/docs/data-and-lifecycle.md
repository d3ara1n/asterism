# Manage data and lifecycle

Choose storage from the meaning of the data. Latest values, historical facts, immutable bytes, and running processes have different lifetimes.

## Separate current state from history

Current data records the latest session or object value. Historical records preserve facts needed to understand or reconstruct past work.

Saving a current value does not automatically create history. Moving to an earlier history position does not restore that value. A resource that supports restoration defines the facts and operations that make restoration meaningful.

Plugin-wide private data belongs to the plugin. Temporary interface choices belong to a view or an object-retained view scope, according to how long they should survive.

## Encode data at boundaries

Data schemas describe the values used by plugin code and how they are decoded from stored or transported JSON. Writers, resource creation, tool results, and presentations accept the decoded value and encode it before storage or publication. Typed readers and views decode the saved value.

Use an ordinary Zod schema when both representations are the same. Use a synchronous `z.codec` when they differ. Both the domain value and its encoding remain JSON-compatible. One-way `.transform()` belongs in input preparation or an explicit conversion before writing; Zod cannot encode it in reverse.

Resource creation returns a card title and plugin-owned `data`. State can be any JSON value, including arrays, scalars, or `null`; object fields such as `id`, `type`, and `title` retain their business meaning. The host stores resource identity and card title separately. Renaming a card changes its host title, and creating resources from a template gives them new host identities while preserving the encoded plugin state.

Configuration defaults are complete decoded values. Reading an older configuration may fill absent fields through ordinary `.default()` declarations. Configuration updates receive decoded values, and saving an unchanged value preserves a correctly defined codec's domain value. The host handles encoding of configuration files and frontend responses.

Codecs own their conversion semantics. Verify meaningful round trips when supplying custom encoders, decoders, or normalization callbacks. Tool results reserve `null` for absent output, so a non-null tool value needs a non-null encoding.

## Reuse resources in templates

A resource opts into data-copy templates with `template: { current: [Settings, Content] }` in its implementation. The list contains existing data contracts owned by the resource's plugin. An empty list copies only the resource's creation state. Resources without this declaration remain available for ordinary use and do not appear in the template picker.

Templates retain encoded creation state and the listed current values that exist at save time. Unlisted current data, history, private files, and running instances are excluded. Instantiation creates new host identities and remaps host links; it preserves domain values and content references without rewriting embedded resource IDs or duplicating external services. Creation callbacks are not rerun, and ordinary presence lifetimes apply to the new objects.

To give each template instance a new title, add a synchronous `createTitle(): string` function to the resource's `template` declaration. Saving then omits the source title, including a user-assigned title. The host calls the function once for each new object when instantiating a template, and uses its result even if an older template contains a title. Saving and previewing templates do not call it. Without this function, templates preserve source titles; a saved entry without a title requires the generator to remain available.

Opt in when those copied values are reusable under new identities. For example, a note can retain its body, and an agent can retain its configuration while leaving submission receipts and drafts behind. Resources needing external cloning, reference mapping, or private-state reconstruction need an explicit domain operation. Historical observation does not perform restoration.

The installed resource must still support templates and decode all saved state and selected current data when the template is used. Unsupported or invalid saved entries fail explicitly before a new session is created.

## Commit and observe

Use the host's bound read and execution capabilities. Complete network and file processing outside synchronous transactions, then commit the resulting state.

A historical snapshot fixes what is observed. A later write acts in the current execution context. Holding a snapshot does not redirect later writes into the past.

For an operation that other consumers must discover before it finishes, declare an operation record with input and output schemas. Begin it in a synchronous commit to publish the input and obtain its record ID. Complete that ID in a later commit with the output. This fills the result at its original position without moving the cursor. The result can be filled once; input and record identity remain fixed.

The record's pending flag distinguishes an unresolved operation from a completed operation whose output is null. Existing snapshots keep their original pending observation; read a new snapshot for current results. Every timeline path containing the operation can read its result, even if another path was selected when it completed.

An object writer can complete that object's pending records. A session writer can finish records owned by its plugin after the emitting object leaves the current path. Completion emits a separate observer notification, not a new-record notification. Resource implementations retain responsibility for ending abandoned work rather than waiting for a runtime that no longer exists.

Transient events announce change. A consumer needing current state establishes its subscription and reads the current value; later notifications prompt another read.

The host publishes `SystemResumed` when the operating system resumes from sleep. Subscribe through `plugin.ipc.events` with the plugin lifetime signal when maintaining absolute deadlines or other state affected by elapsed sleep time. Re-evaluate against the current wall clock when handling the event. It is a transient occurrence and is not replayed after application startup.

Typed calls describe request and response values with ordinary Zod schemas. The caller supplies the input schema's input; the implementation receives its parsed output, including defaults. The implementation returns JSON accepted by the output schema, and the caller receives that schema's parsed output. These types are inferred from the shared declaration, so a conversion such as string to number does not require separate type annotations.

## Read typed history

Public record contracts belong to the package that owns their meaning. The SDK exposes host resource creation, renaming, removal, and link changes. A paradigm's public API supplies its conversation records; a plugin's public package supplies its business records. Import the original contract to decode a record rather than interpreting its JSON fields yourself.

Use `contract.decode(record)` for a single record and `contract.decodeAll(records)` for a commit batch. Batch decoding preserves the supplied order and omits records belonging to other contracts. A matching record returns either `known` with typed `data`, or `unknown` with the original `record` and an invalid-data reason. An unreadable matching record remains visible for reporting and recovery decisions.

```ts
import { ResourceCreated } from "@asterism-app/sdk/contracts";

for (const created of ResourceCreated.decodeAll(records)) {
  if (created.status === "unknown") {
    reportUnreadable(created.record);
    continue;
  }
  handleCreation(created.data, created.record.sessionId);
}
```

For stored history, use `snapshot.records.query(ResourceCreated, { scope: "timeline" })`; it returns the same decoded result shape. `first` and `last` select the earliest or latest matching record and preserve `unknown` when that selected record is unreadable. `timeline` selects the snapshot's ancestor path; `session` includes other branches within its captured append bound. These reads retain original record identity and do not rewrite stored data.

Use `records.index` when only identity, ancestry, order, contract, or provenance is needed. It returns metadata without reading bodies. Queries can combine contracts, record IDs, and an emitting resource ID. `source: null` selects records without an emitting resource. `from` includes its anchor and `before` excludes its anchor; both anchors must belong to the selected scope before filters are applied. `limit` selects a bounded page, and `edge: "last"` selects the last matches while still returning them in append order. A preceding page ends before the first record of the current page.

Query filters intersect, including a typed reader's contract and any supplied contract filter. Repeating a contract or record identity does not duplicate results.

Runtime snapshots read synchronously. Renderer snapshots share the same query semantics, with synchronous metadata and asynchronous body and resource reads. Await those reads before decoding or projecting data. React views can use `useSessionRead` with a memoized reader to distinguish loading, ready, and error states. Forward its cancellation signal to reads so closing a view stops further pages without cancelling other readers of the same body. A failed transfer is not an empty result or an unreadable record. Reuse the session snapshot across related queries; finalized bodies are shared across views, while pending bodies retain their original observation.

The reading hook supplies `retry()` for rereading the current query. `keepPrevious` retains visible content while the same logical query refreshes along its timeline. A `key` identifies that query when the reader callback also depends on presentation inputs; changing the selected record or query scope uses a different key so content from the previous selection is not shown.

A creation record separates resource identity, type, title, and encoded resource state. Its `type` is the resource kind. The nested `data` remains JSON because resource kinds have different state contracts; match the resource kind and decode that state with its resource contract when needed. To read a resource present in a snapshot, use `snapshot.resources.get(resourceContract, id)`. Private current-data entries remain owned by their declaring plugin.

Creation records include new identities instantiated from templates. Moving through history may make an existing resource appear again without creating a new record. Record observers report committed facts; presence events and attachment lifetimes describe membership in the current resource set. A host-created resource record has a null source, with the associated resource identity in its payload.

Public history contracts provide typed observation. Create, rename, remove, and link resources through the session operations; plugin record writers retain their existing ownership checks.

## Retain file content

Stage immutable bytes through the content service, then store their reference in persistent data or a record that owns them.

A `ContentRef` identifies stored immutable content. Copying its identifier does not by itself grant access or retain the bytes. Pass it through the supported operation scope so ownership remains explicit.

Retention follows references in the JSON actually saved. Preserve content references in that encoding when their bytes must remain available; synthesizing a reference during decoding does not retain content or grant access.

When completing an operation with attachments from an independent temporary scope, supply that scope's content reader. The host validates access and retains those result references in the same transaction as completion. Input references remain retained. Close the temporary scope after completion has committed.

## Pass resource file references

Use a `FileRef` to pass an address without reading or retaining content. It contains the full source resource identity and a JSON locator interpreted by that resource. Construct it directly and include it in tool results, typed calls, events, or saved state. No registration, content scope, or consumer link is required.

The source resource implements `openFile` to interpret its locator and produce an asynchronous byte stream. A consumer uses `plugin.files.open(ref, { signal })` and processes chunks as they arrive. Breaking iteration closes the stream. Forward an operation's cancellation signal so its consumption stops with that operation.

Reuse `fileRefSchema` in contracts that return or accept these addresses. Its description supplies the shared meaning. Describe each operation's own use of the reference without coupling its instructions to particular producer or consumer resource types.

Discovery returns addresses and descriptive metadata; it need not open files. Each consumption resolves the source anew across sessions, independently of open UI surfaces. The host does not cache bytes or freeze external files. Changed content is read as it exists at consumption, and missing resources, unavailable providers, or failed reads surface as errors. Persisting a file reference preserves its address, not the bytes it once identified. Use immutable content storage when a business operation needs to preserve a particular version.

## End asynchronous work

Bind shared services to the plugin lifetime and object-owned instances to the resource lifetime. Register cleanup when creating the owned work.

Cancellation requests that work stop. Wait for actual completion before releasing what that work still uses.

Timeline-dependent operations need the host's activity tracking so history changes and object removal can respect active work.

## Evolve stored data

Persistent file formats need explicit preparation when they change. Keep that preparation independent of ordinary service startup.

Historical records retain their original payloads. Supporting an older shape through decoding is different from rewriting the original historical fact.

A codec can accept old and current payload shapes while encoding new writes in the current shape:

```ts
const current = z.strictObject({ text: z.string() });
const textSchema = z.codec(z.union([z.string(), current]), current, {
  decode: value => typeof value === "string" ? { text: value } : value,
  encode: value => value,
});
```

This schema reads an old string as a current object. Plugin code writes the object; historical reads leave the original string untouched.
