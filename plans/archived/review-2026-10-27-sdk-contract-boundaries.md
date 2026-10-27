# SDK contract boundary review

Filed on 2026-10-27. Scope: API-01 in `plans/todo-2026-10-27-public-api-stability.md`, against the working tree after the unpublished SDK moved to 0.47.0. Earlier version-policy changes remain uncommitted. The initial investigation was read-only; dispositions record subsequent user-approved changes.

Archived after findings 1, 2, 3, and 5 were fixed. Finding 4 is assigned to API-02/API-03 in the active public API stability plan; the broader stability audit remains open.

## Findings

### 1. Typed calls expose parsed values at boundaries that consume raw input

**Status:** Fixed in the working tree after user approval. **Priority:** High.

At inspection, `packages/sdk/src/calls.ts` declared `input: z.ZodType<I>` and `output: z.ZodType<O>`. `PluginCalls.invoke` accepted `I`, and `implementCall` required the implementation to return `O`. Both type parameters represented schema outputs; the schema input types were erased.

The runtime has different boundaries:

- `src/plugins/calls.ts:32` parses the invocation argument with the input schema.
- `src/plugins/calls.ts:38` supplies the parsed argument to the implementation.
- `src/plugins/calls.ts:43` keeps the implementation's raw JSON result and validates it with the output schema.
- `src/plugins/calls.ts:52` decodes that raw result for the backend caller. The frontend uses the same public `PluginCalls` contract.

A call with `input: z.string().transform(Number)` typechecks when invoked with `42`, but execution rejects it because the schema requires a string. Invoking with `"42"` succeeds through the raw registry and returns `42`, while the typed client rejects that argument at compile time. A call with `output: z.string().transform(Number)` accepts an implementation returning `42` at compile time but rejects its return value at runtime.

Creation/actions already distinguish schema input from output, as do events. Typed calls need the same distinction using ordinary schema inference. The caller argument, implementation argument, implementation return value, and caller result must each correspond to the appropriate schema side. Authors should not manually duplicate those types.

**Disposition:** `CallContract` now retains the concrete input and output schema types. Invocation takes `z.input<Input> & Json`; implementations receive `z.output<Input>` and return `z.input<Output> & Json`; callers receive `z.output<Output>`. Backend and frontend clients use the same inferred contract. Runtime routing and raw response delivery are unchanged. Type counterexamples cover transformed values, defaults, JSON transport, and scope inference. A focused test exercises both clients through the real call registry with transformations on both sides. Project typechecks and 22 loader/call-client tests passed.

### 2. Reusable data schemas can transform already transformed values

**Status:** Fixed in the working tree after approval of directional data encoding. **Priority:** High.

The same schema currently serves several roles without an explicit canonical-value contract:

| Path | Producer | Consumer |
| --- | --- | --- |
| Configuration | `src/plugins/storage.ts:80` parses and saves the result | Backend reads parse saved data again; `src/renderer/modules/configs.tsx:43` calls `readConfig` on the already parsed backend value |
| Current data | `src/plugins/sdk-context.ts:184` parses and saves | `src/plugins/sdk-context.ts:53` parses on read |
| Historical records | `src/plugins/sdk-context.ts:172` parses and appends | `packages/sdk/src/records.ts:39` parses during decoding |
| Presentation/completion extensions | `packages/sdk/src/presentation.ts:18` parses into the envelope | `packages/sdk/src/model-records.ts:37` parses the envelope data again |
| Resource creation state | `src/plugins/sdk-adapters.ts:97` parses before persistence | `implementResource` and snapshot queries parse the stored value |

The public declarations accept transforming schemas but do not consistently retain their input types or state that repeated decoding must preserve canonical values.

Reproduction using an allowed configuration schema that maps `{ value: n }` to `{ value: n + 1 }`:

1. Declared defaults: `{ value: 1 }`.
2. Backend configuration read: `{ value: 2 }`.
3. The renderer decoding the same backend value: `{ value: 3 }`.
4. `update(value => value)` writes `{ value: 3 }`.
5. The next backend read returns `{ value: 4 }`.

A presentation contract using `z.string().transform(text => ({ text }))` accepts `present(contract, "hello")` and produces `{ text: "hello" }`. Passing that envelope to `completionData` with the same contract returns `null`, because the schema now receives an object where it expects a string.

This is not evidence of current built-in data corruption. Inspected built-in declarations mainly validate values or perform repeatable normalization; provider-response conversions do not establish that these SDK persistence paths use them. It is an exposed SDK capability whose permitted schema shapes can violate its read/write behavior.

**Design work needed:** Distinguish one-way operation-input conversion from canonical stored/transmitted values and historical decoding. A normal author should describe the domain value once; optional legacy decoding should remain separate from private-file migrations. Do not solve this by applying another generic parse pass or by removing validation everywhere. The precise schema/decoder interface requires a public-contract decision.

**Disposition:** The user approved the direction recorded in `plans/archived/ref-2026-10-27-sdk-data-codecs.md`. Writers and presentation/tool producers now encode domain JSON through ordinary schemas or synchronous codecs; readers decode retained JSON. Configuration responses are encoded before frontend decoding. Resource and template state retain the same direction. Saved JSON null no longer looks like an absent current-data row. Tool data retains its existing null absence semantics, and encoding does not mutate plugin-owned result objects.

Focused tests verified configuration defaults/reset/identity updates, backend/frontend agreement, current-data and historical round trips, raw historical preservation, resource projections, template copies, tool progress/results/model projections, and content ownership derived from encoded JSON. Localization normalization now supports encoding, and schema-thrown plugin business errors retain their original codes and display text. Project typechecks and the relevant focused suites passed. No real data was cleaned or migrated.

**Existing sound paths:** Creation/actions carry parsed input through preparation and execution, parsing replacements as new input. Events retain raw wire data separately from decoded delivery data, preventing a frontend decoder from receiving an already transformed payload. These mechanisms should inform the correction rather than be replaced wholesale.

### 3. Resource state exposes an unrestricted JSON type but inherits storage-envelope restrictions

**Status:** Fixed in the working tree after user approval. **Priority:** Medium.

At inspection, `ResourceContract<S extends Json>` and `implementCreation` accepted arbitrary JSON state, but `src/plugins/sdk-adapters.ts:98` required an object and rejected top-level `id`, `type`, and `title` fields.

A resource declared with `z.object({ id: z.string() })` and a creation callback returning `{ title: "Card", data: { id: "external-document" } }` typechecks. Creation fails with `Resource creation data must be an object without reserved id, type or title fields.`

The restrictions originate in the host representation: `src/session/fold.ts` retains resource metadata and domain state in the same object, and `src/plugins/records.ts:14` removes those metadata keys to produce the public snapshot. The plugin author must therefore know a host storage detail that the public generic type does not express.

**Recommended direction:** Separate host metadata from the plugin-owned state in the host representation, then make the SDK's accepted state type match the selected semantics. Keeping an object-only state is a possible explicit design choice; reserving ordinary domain property names merely to accommodate a flattened host record should not become an accidental stable contract. Changing this representation touches storage and template consumers and requires a separate decision. No real data was modified.

**Disposition:** The user approved separating host metadata from arbitrary JSON state and replacing the unpublished format without compatibility support. Resource creation records now contain `{ id, type, title, data }`; `data` holds only the plugin's encoded state. Folding validates the creation envelope through the shared host record contract, and snapshots and templates preserve the state without stripping fields. Resource controllers require explicit JSON data, including null, instead of substituting an empty object. The public creation shape remains `{ title, data }`. Workspace database format is 27; no legacy migration or real-data cleanup was performed.

Project typechecks and 109 tests across nine focused files passed. Cases cover colliding fields, null, arrays, scalar state, host identity lookup, rename versus historical snapshots, independent template identities, codec encoding/decoding, content retention across template reuse and restart, and existing session/resource behavior.

### 4. Output evolution needs domain-specific routing, not a blanket schema setting

**Status:** Verified design constraint; no new current-behavior failure claimed. **Owner:** API-02/API-03.

Closed output unions are consumed as closed domains. For example:

- `packages/builtin/src/agent/context-projection.ts:87` maps all blocks other than tool calls and thinking to text.
- `packages/builtin/src/agent/input-message.ts:10` maps every non-user sender to an Agent envelope and accesses Agent fields.
- SDK model records, tool outcomes, and input parts have closed variants with semantic constraints.

Adding a new media block or external sender cannot be made safe merely by permitting more JSON fields. Existing code needs a defined route and meaning for the new category. Conversely, strict validation is not automatically wrong for an operation input. Shared imported schemas also resolve to the active provider, so an old private validator must not be assumed at every consumption point.

Keep this review's scope on input/output/data responsibilities. Resolve model media, provider-owned operations, and external sender semantics together with their real consumers in API-02/API-03. No universal versioned-envelope system, open union, or silent unknown-variant fallback is established by these findings.

### 5. Loader-owned dependency metadata appears in the author-facing definition

**Status:** Fixed in the working tree after user approval. **Priority:** Low; public-surface cleanup.

At inspection, `PluginDefinition.dependencies` was exposed in `packages/sdk/src/runtime-contracts.ts`, although the package loader computed and replaced it from actual public imports in `src/plugins/packages.ts`. Built-in implementation and author examples did not manually supply it. Internal loader tests used it to construct dependency graphs directly.

The property belongs with the host's assembled plugin metadata. Moving it there would remove a misleading author-facing setting without changing import-derived initialization or cleanup order.

**Disposition:** The SDK definition now declares only namespace, setup, and modules. Package resolution retains backend provider dependencies in host-owned metadata; application composition passes that graph separately to the loader. Initialization, failure propagation, preset contributions, and cleanup use the same import-derived relationships, including providers reached through public-only packages and helper imports. Internal tests supply graphs through host inputs. Package-manager dependency declarations remain unchanged.

Project typechecks and 91 tests across package loading, builtin public imports, loader lifecycle, provider contributions, and SDK runtime suites passed. Validation covers dependent setup failures, cleanup order, user-list override precedence despite dependency order, and indirect shared imports. GUI startup was not automated.

Other low-level exports do not justify blanket removal:

- `ResourceContribution` and `ToolContribution` are the erased shapes returned by typed helpers and used by generic host adapters. Their appearance in the SDK is not by itself a defect.
- Many renderer providers are injected by application composition, while `RendererViewStateProvider` and `RendererPreferencesProvider` also support plugin-owned composition in the built-in package.
- Agent UI providers belong to builtin-api and are supplied by the built-in Agent implementation. Consumer examples use the corresponding hooks and components.

These roles should remain explicit. A new private import bypass or duplicate context instance would undermine the existing composition boundary.

## Initial verification and limitations

- A temporary TypeScript probe was checked with the installed compiler using NodeNext resolution and Node types. It demonstrated that the typed-call and resource examples are accepted, and that the raw string invocation is rejected by the current public call signature.
- The probe ran through the real `PluginStorage`, SDK presentation helpers, `CallRegistry`, `RunLifecycle`, and resource adapter. Unused object/session services were stubbed only for the plugin-scoped call and constant-return creation boundaries.
- Configuration files were written only under a temporary project-local directory and removed in `finally`. Temporary source and build artifacts were removed.
- Existing event SDK and historical-record suites passed: 12 tests across two files. This validates those existing focused contracts, not a proposed redesign.
- No GUI or real user-data validation was performed. Historical/current-data/resource transformation paths were traced in source; they were not all independently exercised through a complete application session.
- The initial inspection changed no implementation or public interface. The subsequently approved typed-call fix and its validation are recorded under finding 1.

## Suggested implementation sequence

1. Correct typed call input/output inference against the existing raw-wire and decoded-value boundaries.
2. Decide canonical data and historical-decoding responsibilities, then update affected write/read paths with focused round-trip evidence.
3. Decide resource-state encapsulation and its storage/template implications before stabilizing that representation.
4. Move loader-owned dependency metadata out of author definitions as a small public-surface cleanup.
5. Continue API-02/API-03 with concrete model/authentication/output/message integrations.
