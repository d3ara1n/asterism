# Public API stability before the first stable release

Filed on 2026-10-27. Initial source inspection: main at `262be7e`.

## Goal and scope

After the first stable release, existing valid plugins should continue to compile and run through compatible application and public-package updates. New capabilities should be introduced through additive contracts without changing existing operations, resource identity, authorization, lifecycle, or persisted meaning.

This plan audits the boundaries that could force breaking changes. A missing feature is not a release blocker when it can be added independently while preserving existing consumers. Completing every deferred feature, freezing internal implementation, and building a universal hook system are outside this task.

The compatibility surface includes `@asterism/sdk`, `@asterism/builtin-api`, external plugin public modules, package manifests and import resolution, documented renderer services, and model-facing tool contracts. Application-private IPC and implementation modules are not automatically public APIs. Application data compatibility begins with the first user distribution, including a friend-facing prerelease; that obligation is independent of when public packages reach stable versions.

## Classification and completion rule

| Class | Meaning | Required disposition |
| --- | --- | --- |
| Freeze decision | A likely extension reaches an existing closed contract or established semantic rule. | Decide the stable boundary and prove either compatible coexistence or complete the necessary breaking change before freezing it. |
| Compatibility defect | Current loading or validation does not enforce the compatibility it claims. | Fix the mechanism and verify a concrete incompatible producer/consumer pair. |
| Additive extension | A new declaration, service, or operation can coexist with the current contract. | Record its owner and additive route; implementation may remain deferred. |
| Evidence gap | The mechanism exists, but old-consumer or old-data behavior has not been demonstrated. | Retain a focused compatibility fixture or an explicit acceptance record. |

An item can close without implementing the future feature. A sufficient closure names the old consumer, the future producer, the retained old behavior, and a concrete additive route. An unresolved assumption that existing interfaces can simply be widened is not sufficient. Decisions affecting public protocols or domain semantics require user agreement; this filing authorizes investigation and records work, not those design decisions.

## API-01 — Define the compatibility promise and contract evolution rules

**Class:** Freeze decision and evidence gap. **Priority:** First.

**Evidence:** Public SDK exports include strict Zod objects and closed unions in `packages/sdk/src/models.ts`, `model-records.ts`, `model-input.ts`, `tool-result.ts`, and `events.ts`. `packages/sdk/src/records.ts` already preserves unknown historical payloads. `model-records.ts` has namespaced completion extensions. Public dependencies bind to the provider's actual declarations rather than a consumer's private copy.

**Breaking-change mechanism:** Adding an optional TypeScript field may still fail a consumer-owned strict validator. Adding a result variant or enum value may break an exhaustive consumer or change an old callback's runtime input. Changing an imported shared schema also changes validation for existing plugin code at load time. Preserving raw historical bytes is necessary but does not establish that an old live consumer can process new output.

- [ ] Inventory supported public exports, manifest fields, shared dependencies, renderer contexts, and model-facing tool names/arguments/results. Distinguish provider-implemented interfaces from host-returned values and persisted payloads.
- [ ] Define compatibility for source compilation, already-distributed plugin code, runtime behavior, and saved data separately. Decide how the promise applies to SDK and builtin-api stable versions.
- [ ] Specify how new output variants reach only consumers that support them: preserve the old contract, use a separate contract/service, or use an explicit extension mechanism where its semantics fit. Do not make every union open or remove validation indiscriminately.
- [ ] Define the relationship between accepted write input, canonical persisted values, and historical decoding. Existing schemas may participate in both writing and reading; a transformation must still accept its canonical saved output, or use an explicitly separated decoding contract.
- [ ] State which semantics remain stable: synchronous commits, action ordering, cancellation completion, request-captured access, current data versus historical snapshots, and trusted in-process plugins.
- [ ] Review exported host integration helpers and implementation-oriented types before they become an accidental permanent plugin API.

**Acceptance:** One real producer/consumer fixture demonstrates an additive field or extension without breaking an unchanged old consumer; a materially new variant has an explicit separate route. Publish the accepted compatibility rules in independently readable engineering documentation, with author guidance owned by the public packages.

## API-02 — Model connection, protocol, and authentication extension boundary

**Class:** Freeze decision. **Priority:** High.

**Evidence:** `packages/sdk/src/provider-usage.ts` fixes `ModelProviderConnection.protocol` to Responses, Chat, or Anthropic and `auth` to API key or none. `runtime-providers.ts` returns these connections and exposes a nullable string credential. `src/plugins/models.ts` selects an internal adapter; its injectable adapter factory is not a public plugin contribution. Preset and usage-provider contributions are implemented, but protocol and authentication implementation contributions are absent.

**Concrete consumer:** A provider plugin requiring another native protocol, renewable credentials, or request signing while participating in the existing model catalog, selection, execution, and diagnostics.

**Breaking-change mechanism:** Widening the existing connection discriminants changes values returned to old provider and usage consumers. Replacing a credential string with an authentication object changes existing implementations. Adding OAuth storage alone does not settle refresh ownership or request-boundary capture.

**Potential additive route:** A separate protocol/authentication registration service and a new connection view could retain the existing connection and credential contracts for their original supported scope. This is a candidate to verify, not an approved design. A plugin making independent HTTP requests is not evidence that it integrates with the application's model services.

- [ ] Trace connection configuration, credential resolution, request capture, usage queries, model selection, and protocol continuation as one boundary.
- [ ] Decide whether existing connection APIs remain a deliberately limited view or become extensible before stable release. Define what old callers observe when new connection kinds exist.
- [ ] Ground the decision in one real additional protocol and one real renewable-authentication integration; provider-specific implementation may remain deferred after the boundary is proven.
- [ ] Preserve existing API-key/no-auth plugins and keep credentials backend-only. Establish ownership of refresh, cancellation, and captured request credentials without redefining resource authorization.

**Acceptance:** A concrete design and focused contract proof show how an unchanged existing provider/usage plugin coexists with the additional protocol and authentication kind. Any unavoidable public type or semantic replacement is completed before the stable boundary is declared.

**Related work:** `plans/todo-2026-10-20-provider-usage-auth.md`; model/protocol items in `plans/todo-2026-10-01-runtime-capabilities.md`.

## API-03 — Model output and external-message evolution

**Class:** Freeze decision. **Priority:** High.

**Evidence:** `packages/sdk/src/models.ts` exposes closed model part, item, live-block, and execution-event unions. `model-records.ts` persists text, thinking, and tool-call blocks. Model input and tool output already carry immutable files through `model-input.ts` and `tool-result.ts`. `packages/builtin-api/src/messaging.ts` distinguishes only user and agent senders; `packages/builtin/src/agent/input-message.ts` projects the non-user case as an agent envelope.

**Concrete consumers:** A model producing image/audio output through ordinary model execution; a provider executing its own server-side tool; a bridge receiving messages from an external human or service with source identity that should survive history projection.

**Breaking-change mechanism:** Adding variants to an existing execution stream reaches old controllers, renderers, projections, and stored-record decoders. Treating a provider-owned operation as an ordinary host tool call changes execution ownership. Treating every external sender as either the local user or another Agent can lock an inaccurate meaning into persisted messages.

**Potential additive routes:** New record contracts, explicitly opted-in stream capabilities, or separate execution/message contracts may preserve the original streams and actions. Completion extensions already support supplemental metadata, but do not by themselves represent ordered media blocks or a different sender's meaning. These routes must be evaluated without implementing a general middleware pipeline.

- [ ] Define the stable meaning and supported scope of the current model stream, tool-call/result states, and Agent sender variants.
- [ ] Walk a concrete generated-file response and provider-owned operation through streaming, completion, history, content retention, and continuation; identify where a parallel contract can preserve old consumers.
- [ ] Walk a concrete external-message bridge through submission, source attribution, saved history, display, and model projection. Decide whether existing sender semantics suffice or a separate input contract is needed.
- [ ] Verify that new domain metadata remains namespaced and cannot silently alter execution ownership or captured access.

**Acceptance:** Unchanged text/tool controllers and old Agent inputs retain their behavior. Each new semantic category has a defined representation and routing boundary; old consumers do not unexpectedly receive an unhandled variant. Shipping media generation, server-side tools, or the bridge itself is not required to close the boundary decision.

## API-04 — Resource duplication, restoration, and data evolution

**Class:** Conditional freeze decision and evidence gap. **Priority:** Medium; resolve before promising generic cloning or restoration.

**Evidence:** Current data is explicitly shared across branches and is not restored by cursor movement (`packages/sdk/src/objects.ts`). `src/runtime/templates.ts` copies resource creation data and all object current-data entries, creates new identities, and remaps host links; arbitrary domain JSON retains its old values. It does not invoke the resource's creation handler or a plugin clone hook. `ResourceContribution.attach` owns presence lifetime, not restoration semantics.

Record decoding and private-file migrations already exist. `implementResource` and `implementTool` parse resource state through the declared schema before typed callbacks. Raw contribution interfaces receive JSON snapshots; typed helpers own their conversion. Host-wide normalization could apply a transformation twice.

**Concrete consumer:** A resource holding another object's reference, an external instance identifier, or derived private state that cannot simply be copied into a new session. A checkpoint-capable resource also needs to distinguish observation of history from an explicit restoration operation.

**Breaking-change mechanism:** Later making every resource's current data branch-local, rerunning creation handlers during template instantiation, or changing what `attach` means would change existing plugins. Automatically rewriting arbitrary JSON references could change user or domain data. Requiring a new restore/clone method from every existing plugin would also break their implementations.

**Potential additive route:** Optional domain capabilities or separate explicit operations for export/instantiate/checkpoint/restore, retaining current-data semantics and the existing behavior for resources that do not opt in. This may be sufficient; absence of a generic restore hook is not itself a blocker.

- [ ] Decide the compatibility promise for template copying, particularly non-copyable resources, external instances, embedded references, and data owned by another plugin on the same object.
- [ ] Prove a resource can add explicit restore/clone support without changing existing resource identity, current data, presence lifetime, or historical facts. If the existing template default must change, make that decision before release.
- [ ] Exercise one upgraded resource schema against saved creation data, current data, historical records, and a template. Keep file migrations and immutable-record decoding distinct.
- [ ] Document the raw snapshot versus decoded typed-callback distinction and resolve any actual inconsistent consumer discovered by the fixture, rather than assuming a host-wide decoding redesign is needed.

**Acceptance:** A resource with an embedded object reference and an external instance has an explicit duplication policy. An old resource still behaves as before through reopening, branching, and template instantiation. Restoration remains an explicit supported operation and does not become an implicit effect of history browsing.

**Related work:** Resource-state restoration and content-sharing items in `plans/todo-2026-10-01-runtime-capabilities.md`.

## API-05 — Public dependency and host-runtime compatibility

**Class:** Confirmed compatibility defect plus freeze decision. **Priority:** High.

**Evidence:** `src/plugins/package-modules.ts` validates version ranges for application-provided public packages, but its external-plugin public-module branch checks dependency presence and provider availability without comparing the consumer's version range. `PackageModule` does not carry the external provider's package version. SDK admission separately checks its peer range in `src/plugins/packages.ts`.

React, React DOM, React Intl, and Zod are bound to host instances. SDK types directly expose React components, Zod schemas, and `node:sqlite`'s `DatabaseSync`. External builds leave native `.node` modules external. Therefore an unchanged SDK version alone cannot establish compatibility with every future framework or Electron/Node runtime.

**Breaking-change mechanism:** A consumer requiring one external public API version can bind to an incompatible provider. A host dependency upgrade can change shared runtime behavior or types while the plugin still appears SDK-compatible. Replacing the exposed database or renderer model later would require retaining the old facade or breaking consumers.

- [ ] Enforce version compatibility for external plugin public dependencies, including dependencies reached through helper packages. Preserve shared declaration identity and environment-specific imports.
- [ ] Decide the supported shared-library/runtime envelope and what package metadata is authoritative. Define admission behavior when that envelope is incompatible.
- [ ] Decide whether React, Zod, synchronous SQLite, and in-process trusted backend plugins are deliberate stable commitments. Keep them if accepted; introduce a narrower boundary before release only if a concrete planned evolution requires it.
- [ ] Clarify native-module and external-asset delivery requirements using a real plugin package. Keep packaging failures distinct from SDK source compatibility.

**Acceptance:** An incompatible external public provider is rejected before consumer setup, while a compatible pair shares the original declarations. A supported unchanged UI/backend plugin remains loadable across a compatible application update; unsupported shared-runtime requirements produce explicit feedback. No speculative abstraction over all third-party libraries is required.

## API-06 — Preserve independent compatibility evidence

**Class:** Evidence gap. **Priority:** After the preceding dispositions; required before the stable promise.

Existing typechecks and tests validate current sources together. They do not by themselves prove that a previously distributed plugin remains compatible with a newer host.

- [ ] Retain representative external plugin source/package fixtures and the public-package versions used to author them. Do not update the old fixture's code whenever the host changes.
- [ ] Cover the owning boundaries with a small set: a resource/tool/settings plugin; a public provider plus consumer; and an Agent integration using input, events, and interaction state. Reuse fixtures where they exercise several relevant contracts.
- [ ] Check both old source against the candidate public types and unchanged distributed plugin code against the candidate host. Verify shared-contract binding rather than substituting test-private declarations.
- [ ] Retain saved data from the old plugin version and verify reopening, decoding, private migration, missing-plugin presentation, and restored availability at the appropriate existing test boundaries.
- [ ] Complete installed-application acceptance for the actual delivery platform, recording the application commit and plugin versions. Manual GUI and native-runtime checks remain user-operated.

**Acceptance:** Each stability claim has an independent old input and expected behavior. Use existing typechecks and focused contract tests; do not build a parallel host, broad UI harness, timing suite, or snapshot inventory to satisfy this plan.

## Missing capabilities that can remain additive

These are tracked separately from architectural freeze decisions. Reopen the classification only when an implementation identifies a concrete existing contract that cannot be preserved.

| Capability | Additive route / owning boundary | Existing work |
| --- | --- | --- |
| Plugin system-prompt contributions | A builtin-api registry captured by the Agent at request boundaries; preserve existing Agent configuration and static top-level tools. | `plans/todo-2026-10-21-plugin-system-prompt.md` |
| Plugin-carried skills | Package metadata or a domain registration service feeding the existing skill catalog; preserve existing skill selection semantics and source priority. | `plans/todo-2026-10-25-plugin-skills.md` |
| Explicit skill picking | New user interaction and input contribution with the old input action still valid. Check API-03 only if message meaning changes. | `plans/todo-2026-10-25-skill-picker.md` |
| Notifications | A new typed event contract and host presentation consumer using the existing event bus. | `plans/todo-2026-10-13-event-bus-plugin-calls.md` |
| Package acquisition, integrity, upgrade, and removal choices | Delivery operations around existing package identity and startup admission; do not redefine resource/history ownership. | `plans/todo-2026-10-12-plugin-system.md` |
| Additional resources, resource tools, top-level tools, calls, events, channels, settings, or card panels | Existing contribution interfaces and public domain packages. | Domain-specific work when selected |
| More session operations, result-returning actions, or paginated history queries | Additional methods/contracts retaining the existing void action and snapshot-query behavior; no evidence currently requires replacing them. | File only for a concrete selected consumer |
| Broader content sharing or plugin-wide content retention | Explicit new ownership/retention capabilities alongside the existing readers and scopes; references must not gain implicit authority. | `plans/todo-2026-10-01-runtime-capabilities.md` |
| Plugin hot reload, separate processes, or persistent scheduled jobs | Separate lifecycle/runtime capabilities if selected; preserve the existing restart-based, in-process, non-resuming plugin contract. | Not required by this stability audit |

Additive does not mean already implemented or automatically approved. Some of these remain product-release requirements in their own plans, especially plugin delivery. This table only says their absence does not currently demonstrate a need for a breaking SDK redesign.

## Order and release disposition

1. Close API-01's compatibility rules and public-surface scope.
2. Resolve API-02 and API-03, where closed shared contracts intersect likely future capabilities.
3. Settle API-04's duplication/restoration boundary and API-05's dependency/runtime contract; fix the confirmed dependency-range gap.
4. Preserve and run API-06's old-plugin evidence against the candidate.
5. For every item, record one disposition: fixed before stable, proven additive and deferred to its owner, or explicitly outside the stable promise with user agreement.

No confirmed finding in this inspection requires replacing the generic contribution, call/event/channel, resource, or lifetime architecture. The remaining risk is freezing an overly broad promise around closed model contracts, implicit duplication behavior, or incomplete compatibility enforcement.

This plan complements `plans/todo-2026-10-26-release-readiness.md`; it does not replace installed update, migration/recovery, product, or platform acceptance. Archive it after every boundary has a disposition and the lasting accepted rules have their own documentation.

## Inspection evidence

The initial audit read public declarations and their host consumers, including package resolution, model selection, resource adapters, templates, content ownership, and renderer binding. No interface or implementation was changed while filing this plan. The preceding readiness investigation passed the existing typechecks and 98 selected plugin tests; those checks covered current contracts, not the old-version compatibility acceptance specified here.
