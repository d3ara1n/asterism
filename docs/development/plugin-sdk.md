# Plugin host and SDK contracts

The SDK connects plugin contributions with host capabilities. The host owns identity, transactions, routing, and lifetime while plugins own domain behavior.

## Assembly and ownership

A plugin is the unit of identity, metadata, settings, dependencies, and lifetime. Functional modules compose its capabilities. A plugin can have shared services or a settings page without contributing a resource.

Read package metadata independently of executable entries so disabled or failed plugins remain manageable. Backend setup registers contributions synchronously. Asynchronous work belongs to managed tasks or an appropriate lifetime.

Assembly freezes the registered contributions. Package installation, enablement, and upgrades take effect after restart. Failed providers block their dependents while unrelated plugins continue.

The package manifest owns the plugin's release version. Runtime definitions declare behavior and identity without repeating that version. Standard package dependencies and lockfiles describe installation; development dependencies provide the declarations used by TypeScript.

Loading depends on the available modules, exports, and valid contributions. The host does not reject a plugin because its declared dependency range excludes the active package version. Type checking and focused execution checks establish compatibility with the APIs a plugin actually uses; a successful import alone does not prove unchanged behavior.

Before SDK version 1.0, incompatible changes advance the minor version; compatible additions and fixes advance the patch version. Stable SDK releases use major versions for incompatible changes, minor versions for compatible additions, and patch versions for fixes. Application releases and plugin-private storage formats are versioned independently.

Compatibility describes the supported meaning of each operation and value. Shared React, React DOM, React Intl, Zod, and synchronous SQLite interfaces are direct integration choices, validated through plugin development and supported runtime updates. Independent plugin artifacts and saved data provide evidence across host changes; changing host and plugin together proves only their current agreement.

Model protocols, authentication methods, generated outputs, and external senders evolve with concrete domain integrations. Existing closed contracts retain their supported scope until that work defines the representation and routing for new consumers. Future capabilities do not require speculative replacement of the generic plugin lifecycle or communication mechanisms.

The host attributes contribution identities to the plugin namespace and rejects conflicting declarations. Missing implementations retain saved data and use missing-resource or raw-data presentation.

## Public modules

Public imports establish runtime dependencies. The host resolves environment-specific exports and binds consumers to the provider's actual exports. The import graph determines initialization order and propagates provider failures. This graph belongs to host loading metadata, separate from author-provided runtime definitions. Package-manager dependency declarations describe how to acquire those packages, without becoming a second runtime admission policy.

A plugin can provide its own public export or declare separate public libraries. Both mechanisms share package-name ownership, so competing enabled providers fail explicitly. A disabled library declaration does not displace an enabled public provider.

Each backend or frontend environment has one module instance for a shared declaration. Identical textual IDs in copied declarations do not establish identity. Stable IDs serve routing, persistence, and cross-process association.

The built-in public API is a separate package associated with the built-in implementation plugin. Its release version is independent of the SDK package version.

Public packages own their development guides and source examples according to domain responsibility. Generic authoring material belongs to the SDK; built-in domain material belongs to the built-in public API. Package contents include that material for development outside the application. The manual exposes source directories directly without copying or merging their contents. Compile-time counterexamples remain internal verification material.

Plugins and their declared public API libraries can declare manual directories in package metadata. Admission validates existing, non-overlapping subdirectories within each declaring package. The application exposes directories from successfully loaded providers under plugin-qualified paths; disabled plugins and plugins with loading or storage failures contribute none. Declarations follow the startup package snapshot, while file contents are read at operation time. Articles carry their own context and remain independently readable.

Provider initialization precedes consumers. Shutdown waits for managed work, then cleans up in reverse dependency order. Public exports do not grant resource access or another plugin’s private state.

## Readers, executors, and snapshots

Read interfaces expose bound identity, current data, and snapshot queries. Execution interfaces add controlled commits and operations. The tool session interface has a narrower scope based on the invoking object and captured request access.

Snapshot creation captures the history endpoint, record upper bound, and title without loading the whole history. Timeline queries read the ancestor path; session queries include branches up to the captured append bound.

Resource relationship queries use that same captured timeline path. They return present resources directly linked to a receiver whose full identity matches the snapshot, with captured titles and public data. Reverse and transitive relationships remain independent. Observing relationships neither exposes private state nor changes a model request's captured operation scope.

First/last queries decode their selected record and preserve unknown status rather than skipping damaged records. Current-data reads return current values at handling time, independently of historical snapshots.

Commits are synchronous. Nested same-session commits join the outer transaction; asynchronous commit callbacks fail. Append uses the current cursor at commit time.

Record-commit and cursor-change observers are distinct. Post-commit observer failure is logged and does not roll back the original transaction. Title assignments append host records; continuing from another position restores the path's title without appending an assignment. Domain observers can request new assignments according to their own policy.

## Creation and actions

A plugin can prepare a complete session before committing it. Preparation produces resource tokens and can run action preparers against their reserved identities. The initializer synchronously commits session identity, resources, initial records, and the plugin-scoped retry receipt. It receives no implicit Agent or first-message requirement. A failed attempt leaves no persistent partial session; an accepted retry returns the existing identity.

Shared contracts declare resource creation and object actions. Implementations bind the original declarations.

The preparation pipeline parses owner input, runs matching external preparers, then resource preparation. A replacement is new raw input and passes through the owner’s schema immediately. Accepted input proceeds to execution without redundant parsing.

Preparation receives read-only facades. Creation commits identity, initial state, and links together. Actions execute in the object queue. Current presence and execution scope are checked where an operation commits.

Frontend and backend operations use the same host mechanisms. A backend action call does not obtain the target’s private executor. A call in the current action chain back into the same target fails rather than deadlocking behind itself.

Creation can establish initial links and return the new identity plus its creation-time title. Tool creation automatically links the new object to the caller; optional initial resources stay within captured request access. Exposing the caller creates only that explicit reverse relationship.

Renaming, removal, and link operations use shared host mechanisms for resource identity, presence, and lifecycle. Renaming appends a title event; existing snapshots retain the title at their captured timeline endpoint. Tool renaming and removal resolve targets within captured request links. Caller knowledge of an ID does not establish scope.

## Lifetimes and busy work

The host tracks application, session, and object lifetimes. Plugin shared services belong to its application lifetime; object-owned external instances belong to resource attachment.

Ending a lifetime signals cancellation, waits for dependent work, and runs registered cleanup in reverse order. A signal alone does not prove completion. Cleanup failure is reported while remaining cleanup proceeds.

Objects attach when they enter an active session’s current resource set, including startup and cursor reconstruction. Card mounting is unrelated. Reappearing objects initialize according to their resource implementation.

Busy means work depends on the active timeline. It blocks session cursor changes and removal of the busy object. It does not determine domain execution state or sidebar notifications.

Managed model/tool work, actions, and explicit busy scopes own their occupancy until real completion. Read-only communication does not become busy merely because it references an object.

Invalidating a projection publishes current domain state without creating a record or changing stored data. Within a transaction, publication follows successful commit.

## Typed calls, events, and channels

Calls declare plugin or object scope. Object calls validate a full resource reference; omitting that reference does not turn them into plugin calls. Inputs and outputs validate at their responsible boundaries.

Call declarations retain both sides of their schemas. Invocation accepts raw JSON input and implementations receive parsed input. Implementations return raw JSON accepted by the response schema; each caller decodes that response into its result type. Schema inference preserves these distinctions for backend and frontend clients.

Input content is a separate call capability. The host binds its authority to the declared entry and retains referenced bytes for the call. Passing content IDs in business JSON does not grant access. Initial session records and current data acquire persistent ownership within their initialization transaction.

Calls remain independent of the object action queue, allowing answers to reach a waiting tool. Communication cancellation and business cancellation are separate. There is no default timeout or automatic replay.

Events carry contract, timestamp, host-stamped origin, and typed data. They are transient, nontransactional, and absent from history and model context.

Occurrence events preserve every event. Snapshot events may coalesce the latest pending value for the declared key. A subscriber processes its own queue in order; failures end that subscription.

Consumers subscribe and then query domain state. The event bus does not retain current state or replay a disconnected interval.

Object channels support sustained bidirectional data. Opening validates current presence and plugin ownership. Closing, object disappearance, provider unavailability, or connection loss ends the channel. It neither writes history nor occupies the timeline by itself.

The host trusts installed plugins. It protects identity, history, and its declared interfaces without adding speculative quotas, silent overflow, or automatic business recovery.

## Provider services

Plugins contribute model connection presets, account usage providers, and web providers. The host owns catalog validation, shared service state, and lifecycle. Plugins choose how to compose these capabilities and present their results.

Preset additions and patches follow dependency and declaration order. Patches merge declared top-level fields and connection fields, with arrays replaced as wholes. Failed assembly removes the plugin’s contributions.

Usage providers distinguish active queries from response-header interpretation. Consumers supply the selected connection and credentials or response; the generic model service does not implicitly trigger account queries.

The host's shared usage service reads configured credentials, caches query results, and retains explicitly supplied header observations. Model requests use concrete provider/model targets. Role resolution and prompt composition belong to the requesting paradigm; the host transports ordered prompt bodies and supplies captured linked context for plugin assembly.

Backend credentials remain explicit trusted-plugin capabilities. Frontend consumption uses typed domain calls rather than the credential vault.

## Persistence and content

Plugin-private files live under the plugin data directory. Managed configuration and a database are optional facilities, not prerequisites for plugin identity.

Storage preparation imports a separate declaration entry before runtime setup. JSON and SQLite formats use independent versioned migration chains. A plugin preparation failure prevents its setup for that startup.

Historical payload compatibility comes from schema decoding. Unknown or unavailable data retains its original payload. Private file migration and historical record decoding are distinct responsibilities.

Data write boundaries encode decoded domain values through the declared Zod schema and validate the resulting JSON before saving or publishing it. Readers decode stored or transported JSON. Ordinary schemas use the same representation in both directions; synchronous codecs explicitly convert between representations. Operation-input parsing remains a forward-only boundary.

Configuration defaults and update callbacks use decoded values. File writes and configuration responses encode those values; frontend configuration readers decode the responses. Missing current-data rows remain distinct from a saved JSON null. Templates copy encoded state and data without applying another encoding pass.

Resource creation records separate host identity, kind, and card title from plugin-owned encoded state. The state accepts any JSON value and has no reserved business field names. Historical folding and snapshots preserve that separation. Renaming changes only the host title; template instantiation replaces host identities and relationships while preserving plugin state. Content retention follows references in the encoded state.

Template participation is explicit resource behavior. The resource declares which plugin-owned current-data contracts are reusable alongside its creation state. Object writers already require matching resource and data ownership; the resource author determines its own copy policy. Saving selects only those current entries. Instantiation validates the saved state and current entries against the installed policy before creating a session, preserves their encoded values, and remaps only host identities and links. Historical records, private storage, and running instances are excluded. Creation handlers are not replayed. External cloning, embedded-reference mapping, and restoration require explicit domain capabilities.

A resource may declare a synchronous title generator for template instances. This declaration omits the source title from saved templates and overrides any previously saved title at instantiation. Saving and catalog reads do not invoke the generator; previews show the resource type without an instance title. Without a generator, instantiation requires a saved title. The generated title enters ordinary resource creation history, so later reads and restoration preserve it.

Tool progress and terminal data carry encoded payloads. Typed renderers and model projections decode them. Without a declared projection, a decoded string reaches the model as text and any other value as JSON text; only a declared projection can return model parts such as files. Resource tools and top-level tools share this rule. Non-null tool data cannot encode as null because the tool-result protocol reserves null for absent output.

The content service manages byte references and temporary retention. Public IDs alone grant neither access nor retention.

Content roots follow the actual encoded persistent JSON within the owning transaction. Historical decoding neither changes those roots nor grants access to references synthesized by a decoder.

## Renderer contributions

The renderer can contribute cards, tool phases, history records, creation entries, Home session entries, and independent settings pages. Frontend preparation can establish services independently of card mounting and binds them to a cancellation scope.

Imported styles are frontend build dependencies. The host preserves each entry's CSS association through compilation, caching, and startup projection, and loads styles in dependency and registration order before preparing the frontend. Initialization failures and frontend shutdown release the associated styles; individual view mounting does not own them.

Individual preflight builds isolate source errors and exclude failed providers and their consumers. Ready renderer entries then compile together so CSS Modules receive distinct names across the shared document. A failure of this final shared build affects its frontend-bearing packages; unrelated backend-only packages retain their successful builds.

Plugins share the document's CSS cascade and host theme variables. CSS Modules localize class names without creating a separate rendering environment. Preprocessors remain the plugin's responsibility; the host consumes their CSS output and serves bundled assets with their relative paths intact.

Resource descriptions supply stable type presentation. Cards and auxiliary panels consume projected data; the host owns their surrounding layout, focus, and lifecycle.

Retained object view state survives virtualized item remounts and container changes while that object remains present. Component-local state and persistent resource data remain separate.

Creation entries coordinate menu and drop input through the same host creation pipeline. Settings pages can open deeper host-managed islands and declare unsaved-state behavior.

Tool input, execution, and result phases share presentation identity but consume different data. Streaming-preview declarations request ordinary automatic disclosure; attention declarations request one immediate disclosure for user handling.

Agent-specific toolbar, overlay, and modal composition belongs to `@asterism-app/builtin-api`, not a generic SDK slot system.
