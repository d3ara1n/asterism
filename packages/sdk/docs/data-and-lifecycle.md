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

Opt in when those copied values are reusable under new identities. For example, a note can retain its body, and an agent can retain its configuration while leaving submission receipts and drafts behind. Resources needing external cloning, reference mapping, or private-state reconstruction need an explicit domain operation. Historical observation does not perform restoration.

The installed resource must still support templates and decode all saved state and selected current data when the template is used. Unsupported or invalid saved entries fail explicitly before a new session is created.

## Commit and observe

Use the host's bound read and execution capabilities. Complete network and file processing outside synchronous transactions, then commit the resulting state.

A historical snapshot fixes what is observed. A later write acts in the current execution context. Holding a snapshot does not redirect later writes into the past.

Transient events announce change. A consumer needing current state establishes its subscription and reads the current value; later notifications prompt another read.

Typed calls describe request and response values with ordinary Zod schemas. The caller supplies the input schema's input; the implementation receives its parsed output, including defaults. The implementation returns JSON accepted by the output schema, and the caller receives that schema's parsed output. These types are inferred from the shared declaration, so a conversion such as string to number does not require separate type annotations.

## Retain file content

Stage immutable bytes through the content service, then store their reference in persistent data or a record that owns them.

A reference identifies content. Copying its identifier does not by itself grant access or retain the bytes. Pass it through the supported operation scope so ownership remains explicit.

Retention follows references in the JSON actually saved. Preserve content references in that encoding when their bytes must remain available; synthesizing a reference during decoding does not retain content or grant access.

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
