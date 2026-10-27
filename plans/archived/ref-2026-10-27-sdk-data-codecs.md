# Directional data encoding for SDK contracts

Filed on 2026-10-27. Design reference for finding 2 in `plans/archived/review-2026-10-27-sdk-contract-boundaries.md`.

## Disposition

The user approved this direction after reviewing the proposal. Directional encoding is implemented in the working tree for current data, records, resource creation, presentations, configuration, and tool output. Configuration IPC carries encoded responses; typed readers retain decoded values. Templates copy encoded values without another encoding pass. Content roots bind the encoded JSON.

Implementation preserves plugin-owned tool result objects and plugin-authored business errors. Localized UI messages use repeatable locale normalization that supports encoding. Saved JSON null is distinct from a missing current-data row; non-null tool results cannot encode to the protocol's absent-output marker.

Project typechecks and focused storage, configuration, history, resource/tool, completion-extension, content, template, rendering-calculation, and localization tests passed. GUI acceptance and real-user-data migration were not performed. Resource metadata flattening and other SDK review findings remain separate work.

## Original proposal

The following proposal and its initial verification record are retained as design history. At filing, only typed-call repair and investigation of this design were authorized; the later approval and implementation are recorded above.

## Problem and recommendation

Several SDK boundaries accept a parsed domain value, parse it again when writing, persist the new result, and parse that result when reading. Configuration additionally sends an already parsed value to a frontend that parses it again. A single schema can therefore change data repeatedly or reject its own saved output.

Use Zod's existing directional operations for retained data: encode a domain value into JSON at a write or transport boundary, and decode that JSON at a read boundary. Ordinary data continues to use one ordinary Zod schema. A plugin that needs different representations supplies a standard synchronous `z.codec` with explicit directions. No Asterism-specific codec language, schema-class inspection, or additional version marker is needed.

The installed Zod 4.6.6 exposes these APIs. Zod's 4.6.5 documentation and the installed source both describe ordinary schemas, codecs, defaults, and encoding failures for one-way transforms.

## Author-facing meaning

A data contract's inferred output remains the value used by plugin code. It remains JSON-compatible; supporting arbitrary Date objects, classes, or other runtime values is outside this proposal.

```ts
const Text = defineData(
  "example/text",
  z.strictObject({ text: z.string() }),
);

present(Text, { text: "hello" });
```

The ordinary declaration remains unchanged. `present` should accept the contract's inferred domain value instead of `unknown`, consistent with current-data writes, record appends, and configuration updates.

For older records stored as a string, a standard codec can accept both old and current representations while writing the current one:

```ts
const current = z.strictObject({ text: z.string() });
const compatible = z.codec(z.union([z.string(), current]), current, {
  decode: value => typeof value === "string" ? { text: value } : value,
  encode: value => value,
});

const Text = defineData("example/text", compatible);
```

New code supplies `{ text: "hello" }`, new writes store that object, and old string payloads decode into the current shape. This example demonstrates a proposed use of existing Zod codecs with SDK data contracts; the current SDK still parses on write and does not implement these directional boundaries.

Operation inputs remain different: creation, actions, typed-call requests, and event publication can accept one-way conversions. Their consumer parses the supplied input. They do not need to encode a domain value back into a retained representation.

## Boundary rules

Let `S` be the declared schema. Plugin code uses `z.output<S>`. Stored or transported data is the JSON result of `z.encode(S, value)`. Reads use the schema's forward decoding operation; where raw data is unknown, `safeParse` has that same forward direction.

| Boundary | Writer or producer | Stored/transmitted value | Consumer |
| --- | --- | --- | --- |
| Current data | `set` accepts the decoded domain value | Encode, then validate JSON and bind retained content | Decode stored JSON |
| Immutable records | `append` accepts the decoded domain value | Encode and append without changing prior records | Decode a copy; retain the original raw record alongside it |
| Presentation and completion extensions | `present` accepts the decoded domain value | Encoded JSON in the presentation envelope | Decode envelope data once for the typed consumer |
| Configuration | `update` and renderer save accept the decoded domain value | Encode before file persistence | Backend reads decode the file |
| Configuration IPC | Backend holds decoded configuration | Encode before putting values and defaults in the response | Frontend decodes the response |
| Resource creation state | Creation returns the decoded domain value | Encode before persistence | Snapshot queries and typed callbacks decode raw state |
| Tool progress/results | Plugin produces the decoded result value | Encode before retaining or publishing result data | Renderer and custom model projection decode for their typed consumers |

A decoded result must never be passed to a decoder as though it were the encoded value. This is the principal invariant the host implementation must own.

Resource encoding remains subject to the current object-state storage restrictions until the separate resource-metadata finding is resolved. The directional change does not implicitly authorize a resource record-format redesign.

## Configuration and defaults

Configuration defaults are complete domain values, matching the current public type. Validate their encodability when declaring the configuration and retain a detached domain value. Backend fallback and frontend fallback must agree on that value.

For a plain schema with `.default()`, Zod applies missing-field defaults on forward decoding. Encoding takes the already complete domain value. This supports reading older configuration bodies without making each default a separate migration callback.

An identity update follows:

```text
stored JSON -> decode -> domain value -> update(value => value) -> encode -> stored JSON
```

A correctly defined codec preserves the domain value across that cycle. For old data, an explicit update may save the current representation. A read by itself does not save or migrate the file.

Frontend configuration handling must distinguish a decoded value returned to a component from an encoded IPC payload. The initial defaults path, reset path, saved values, and change notifications all need the same convention.

## Historical compatibility and content ownership

Historical decoding does not change `SessionRecord.data`. Failed decoding retains the existing unknown-record behavior. Current-data and configuration failures retain their existing distinct policies; adopting codecs does not introduce silent fallback for every data service.

Private-file migration chains continue to own file/envelope changes. A codec can interpret old payload shapes when that is sufficient. If two versions have the same shape but different meanings, the domain still needs a discriminator or an applicable migration; a codec cannot infer historical intent from identical data.

Content ownership and retention bind to the actual encoded JSON written in the owning transaction. Decoding cannot grant access or establish retention for newly synthesized content references. Codec authors must preserve explicit content-reference values in the persisted representation when they need those bytes retained.

## Tool and catalog integration

The implementation must cover every producer/consumer of the affected contracts. Changing only database writes would leave the same problem in cards, completion extensions, tool progress, or configuration IPC.

Resource tool results currently use `DataContract`; top-level tools have an equivalent result schema. Both should use the same directional result behavior. A typed `toModel` callback receives the decoded domain value. The default model projection also needs an explicit choice of the value it serializes, so encoded storage details do not accidentally change the model-facing result.

Host-provided catalogs must establish whether their source is already a decoded domain value or raw JSON before applying a contract. A generic extra parse at each layer is not the answer.

JSON Schema projection must use the appropriate schema side for the value it describes. Existing model-facing argument/result contracts and their representability requirements need focused verification when a codec is used; ordinary tool declarations should retain their behavior.

## Limits and rejected alternatives

Zod rejects one-way `.transform()` during encoding with `ZodEncodeError`. A data contract with such a transformation must use an explicit codec or move the one-way conversion to an operation/form input. This is an upstream encoding rule, not a custom traversal that tries to classify Zod internals. The host should associate the error with the responsible contract and fail before persistence or publication. `safeEncode` can still throw for unsupported transformations, so implementation must not assume every failure is a returned validation object.

Zod does not prove that arbitrary user functions are inverse, pure, or semantically correct. A codec whose decoder increments a number and whose encoder returns it unchanged can still drift. Custom `.overwrite()` callbacks can also change values in both directions. These are authored conversion semantics, not something the host can infer from matching TypeScript types. Use repeatable normalization or a correctly defined codec, and test the relevant domain round trips.

The design deliberately avoids a mandatory deep-equality check after every parse/encode/decode. Such a check could catch drift, but would introduce a separate acceptance rule for ordinary defaults, stripping, trimming, and custom conversions, add work at every boundary, and still not prove arbitrary plugin behavior correct.

A separate canonical schema plus an optional historical decoder is viable, but would add an SDK-specific decoding declaration and require explicit routing for behavior already expressible by normal Zod defaults, unions, and codecs. It is preferable only if the product decides that encoded and domain JSON must always have identical representations. That restriction is not currently established by the public generic contracts.

Persisting raw input and parsing only on reads works for one-way messages. It does not generally support `update(value => value)` when reads and writes have different types and no reverse conversion exists.

## Verification performed

In-memory probes using installed Zod verified:

- A plain object schema round-trips through `encode` and `decode`.
- The old-string/current-object codec above decodes old data and encodes new values as the current object.
- A defaulted property is present after decoding an older missing field, and a complete domain value encodes successfully.
- Encoding a one-way transform raises `ZodEncodeError`.
- An incorrectly defined codec and a non-repeatable `.overwrite()` can still drift; this limitation is explicit rather than presented as automatically solved.

These probes establish upstream behavior only. No SDK data path has been changed or accepted under this proposal.

Primary documentation: https://zod.dev/codecs and the versioned codec guide at https://github.com/colinhacks/zod/blob/v4.6.5/packages/docs/content/codecs.mdx.

## Proposed acceptance scope

Exercise real owning boundaries with a plain schema and a JSON-to-JSON codec: current-data and record round trips, unchanged raw historical records, configuration default/reset/identity updates, backend/frontend agreement, presentation decoding, and streamed/final tool results consumed by renderers and model projection. Verify that encoding failures happen before data/content ownership changes.

Retain the established synchronous commits, processing order, cancellation, plugin lifetime, and JSON constraints. No real-data cleanup, npm dependency addition, or public data-interface change is authorized by this reference record.
