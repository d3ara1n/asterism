# Plugin host and SDK contracts

The SDK connects plugin contributions with host capabilities. The host owns identity, transactions, routing, and lifetime while plugins own domain behavior.

## Assembly and ownership

A plugin is the unit of identity, metadata, settings, dependencies, and lifetime. Functional modules compose its capabilities. A plugin can have shared services or a settings page without contributing a resource.

Read package metadata independently of executable entries so disabled or failed plugins remain manageable. Backend setup registers contributions synchronously. Asynchronous work belongs to managed tasks or an appropriate lifetime.

The distribution catalog remains discoverable independently of the user's loading list. Removed bundled packages retain metadata and an explicit add action in plugin management; displaying them does not restore their list entries or load their code. Adding a bundled package uses the same identity validation and restart boundary as adding a local package.

Assembly freezes the registered contributions. Package installation, enablement, and upgrades take effect after restart. Package discovery, artifact admission, storage, import, and backend assembly failures exclude the affected packages and their dependents before the backend catalog is published. Unrelated plugins continue. The published package outcomes and registered contributions come from the same assembly result.

Storage admission covers every package, including packages without backend setup. Backend setup uses provisional registrations so later setup callbacks can consume provider services. Contribution validation and dependency failure propagation remove excluded owners and cancel their managed work before publication. Cleanup runs under the existing lifetime rules. Setup effects such as committed data, file writes, and external operations are not transactional and are not rolled back.

The package manifest owns the plugin's release version. Runtime definitions declare behavior and identity without repeating that version. Standard package dependencies and lockfiles describe installation; development dependencies provide the declarations used by TypeScript.

Loading depends on the available modules, exports, and valid contributions. The host does not reject a plugin because its declared dependency range excludes the active package version. Type checking and focused execution checks establish compatibility with the APIs a plugin actually uses; a successful import alone does not prove unchanged behavior.

Before SDK version 1.0, incompatible changes advance the minor version; compatible additions and fixes advance the patch version. Stable SDK releases use major versions for incompatible changes, minor versions for compatible additions, and patch versions for fixes. Application releases and plugin-private storage formats are versioned independently.

Compatibility describes the supported meaning of each operation and value. Shared React, React DOM, React Intl, Zod, and synchronous SQLite interfaces are direct integration choices, validated through plugin development and supported runtime updates. Independent plugin artifacts and saved data provide evidence across host changes; changing host and plugin together proves only their current agreement.

Model protocols, authentication methods, generated outputs, and external senders evolve with concrete domain integrations. Existing closed contracts retain their supported scope until that work defines the representation and routing for new consumers. Future capabilities do not require speculative replacement of the generic plugin lifecycle or communication mechanisms.

The host attributes contribution identities to the plugin namespace and rejects conflicting declarations. Missing implementations retain saved data and use missing-resource or raw-data presentation.

## Completed artifacts and source ownership

Plugin source transformation is an explicit author/build operation. The application loader consumes completed native ESM artifacts; it has no startup compiler, source fallback, or source-change detection. Bundled packages, user-owned local directories, and managed npm installations share this execution contract. Acquisition and file ownership do not create different plugin modes.

Package metadata remains readable without importing executable entries. The root manifest owns release identity, display metadata, translations, and manuals. `asterism.build` is authoring configuration for the standalone builder, not input to startup transformation. It names the source entries and the public specifiers the plugin provides in each realm. Package dependency declarations supply the remaining boundary information, so the build has no separate list of shared or external packages.

Module boundaries are left to the platform resolvers wherever one exists. The backend graph compiles only the plugin's own sources; every installed package stays a bare import that Node resolves from the plugin package, with that package's own export conditions, files, and native binaries. Peer dependencies mark imports that the host or another plugin supplies at load time. The application-supplied module list is one shared declaration consumed by the builder, the backend resolution hook, and the renderer import map. The browser has no package resolver, so the renderer graph bundles private dependencies and leaves peers external, converting bundled CommonJS access to those peers into ESM imports.

A successful build replaces the package's `dist` directory as a whole; a failed build leaves the previous output intact. The directory holds `artifact.json` and the emitted files. The descriptor identifies the plugin, relative executable and stylesheet paths, exact public exports per realm, and the peer imports the output uses. Descriptor paths resolve relative to the output directory, never to the builder's checkout. The npm release version and artifact format version answer different questions.

Startup captures descriptors, paths, public bindings, and dependency graphs once, and preparation and runtime consume that captured selection. Output files are not versioned per build: replacing output under a running application can break its later lazy imports until restart, which is an accepted, visible failure rather than a case guarded by retained build history. Installed dependencies and root manuals remain owner-managed files, not a recursive byte snapshot.

Build runtime, storage, and owned runtime public entries together in one backend graph. Build renderer and owned browser public entries together in a separate graph. Shared chunks preserve provider declaration identity within each realm. Storage preparation and task execution do not share process memory, even when both select the same backend output.

Build before distribution. A package must include its completed output, required root metadata and material, and its installed runtime dependencies. Installation does not need to compile plugin source. Relocatable JavaScript does not make native dependencies platform- or ABI-independent. Typechecks, build checks, and process-backed integration tests establish their respective boundaries; installed Electron behavior, production CSP, and target-platform operation require their own acceptance. A source-checkout check is not evidence for a delivered installation.


## Managed package acquisition

The host's plugin settings own npm acquisition; no paradigm plugin participates. A pinned, bundled pnpm distribution runs through the application's Node environment, including a scoped Node command shim for dependency scripts. Registry and proxy behavior follows the package-manager environment rather than assuming a system npm executable is present. The installer's version preview uses script-free lockfile resolution because the bundled pnpm version delegates its registry view command to external npm.

Each concrete installation has an owned directory, private dependency tree, and lockfile. Selection changes only after the exact inspected package identity/integrity and completed artifact have been validated. Dependency builds require explicit approval through pnpm's supported policy. Installation and cancellation own and settle their subprocess work; third-party script effects are not transactional. No downloaded dependency is activated merely because its package metadata declares a plugin.

Running and next-start selections remain distinct. Updates preserve active installation files, and a fresh startup reclaims unselected owned installations. Local paths are never reclaimed. Recovery retains selections and installation records, including lockfiles and build approvals, but not the downloaded trees. Reinstalling a missing exact version can reuse its retained record; startup does not silently acquire missing code or change a version after failure.

## Public modules

Public imports establish dependencies. A consumer declares the provider's package as a peer dependency, and the builder keeps those imports external throughout the graph. A provider lists the exact specifiers it owns per realm; each one resolves through the provider's package exports, including package self-references, so no source path is repeated in build configuration. Public ownership is package-wide: another subpath of an owned package cannot become a private copy. Generated metadata records exports and imports used for admission.

The host binds consumers to real module files. In the backend, a resolution hook remaps only the peer imports a plugin's descriptor records: application-supplied modules go to the host's own module files, which the application build emits as separate chunks of the instances it uses, and plugin-public modules go to the provider's entry files. Because every target is an ordinary file, `import`, `require`, live bindings, and namespace identity behave as they do for any package. The renderer receives its complete import map before plugin modules load; its host modules are page facades over the page's stable instances and do not promise arbitrary reassignment or module-namespace identity.

Peer identity covers the plugin's own code. An installed dependency that imports a peer package itself resolves through ordinary npm rules, which can yield a private copy; passing host objects into such a dependency for identity checks is outside the shared boundary.

Missing, disabled, or failed providers never fall back to consumer-private copies; a backend import of another plugin's public module without a peer declaration fails instead of loading an installed copy. ESM imports, re-exports, and literal dynamic public imports belong to the recorded public boundary; arbitrary computed public requests are not.

Backend and frontend graphs independently determine initialization order. Startup failure propagation follows all public dependencies, including public-only intermediaries. Opposite dependency directions across environments do not constitute an initialization cycle; cycles within an environment's initialization order fail explicitly, including frontend cycles requiring ordered stylesheet admission. Module-only public cycles defer linking to native ESM. These graphs belong to host loading metadata, separate from author-provided runtime definitions. Package-manager dependency declarations describe how to acquire those packages, without becoming a second runtime admission policy.

A plugin can provide public entries from its own package or from a separate installed API package. Both share package-name ownership, so competing enabled providers fail explicitly. A disabled provider does not displace an enabled one.

Each backend or frontend environment has one module instance for a shared declaration. Identical textual IDs in copied declarations do not establish identity. Stable IDs serve routing, persistence, and cross-process association.

The built-in public API is a separate package associated with the built-in implementation plugin. Its release version is independent of the SDK package version.

Public packages own design guidance and prototype examples for their domains. The Manual exposes both as reference material without loading the examples as plugins. Authors resolve implementation interfaces from the target SDK and public domain exports.

Public history facts have contracts at the same ownership boundary as their meaning. The SDK owns host resource lifecycle and relationship records; paradigm and business records belong to their public domain packages. Host writers, reconstruction, presentation, and plugin readers share those declarations. Exporting a read contract does not transfer record ownership or permit plugins to write host-originated facts.

Plugins and their declared public API libraries can declare manual directories in package metadata. Admission validates existing, non-overlapping subdirectories within each declaring package. The application exposes directories from successfully loaded providers under plugin-qualified paths; disabled plugins and plugins with loading or storage failures contribute none. Declarations follow the startup package snapshot, while file contents are read at operation time. Articles carry their own context and remain independently readable.

Provider initialization precedes consumers. Shutdown waits for managed work, then cleans up in reverse dependency order. Public exports do not grant resource access or another plugin’s private state.

Resource warning discovery belongs to each loaded backend, which enumerates warnings from its existing live instances. The host queries each backend once, selects the affected resource references, and resolves titles only for warnings on the current workbench. It does not reconstruct every saved resource or activate cold instances to ask whether they need cleanup. Removal, archival, and application exit share this discovery boundary; actual cleanup remains attached to owned lifetimes.

## Readers, executors, and snapshots

Read interfaces expose bound identity, current data, and snapshot queries. Execution interfaces add controlled commits and operations. The tool session interface has a narrower scope based on the invoking object and captured request access.

Snapshot creation captures the history endpoint, record upper bound, and title without loading the whole history. Timeline queries read the ancestor path; session queries include branches up to the captured append bound.

Resource relationship queries use that same captured timeline path. They return present resources directly linked to a receiver whose full identity matches the snapshot, with captured titles and public data. Reverse and transitive relationships remain independent. Observing relationships neither exposes private state nor changes a model request's captured operation scope.

First/last queries decode their selected record and preserve unknown status rather than skipping damaged records. Current-data reads return current values at handling time, independently of historical snapshots.

Single-record decoding and batch decoding share the same contract decoder. Batches preserve input order, filter unrelated contract identities, and retain unreadable matching records with their raw envelopes. Snapshot queries return the same decoded result shape while retaining their captured path and append bound.

Commits are synchronous. Nested same-session commits join the outer transaction; asynchronous commit callbacks fail. Append uses the current cursor at commit time.

Record-commit and cursor-change observers are distinct. Post-commit observer failure is logged and does not roll back the original transaction. Title assignments append host records; continuing from another position restores the path's title without appending an assignment. Domain observers can request new assignments according to their own policy.

## Creation and actions

A plugin can prepare a complete session before committing it. Preparation produces resource tokens and can run action preparers against their reserved identities. The initializer synchronously commits session identity, resources, initial records, and the plugin-scoped retry receipt. It receives no implicit Agent or first-message requirement. A failed attempt leaves no persistent partial session; an accepted retry returns the existing identity.

Shared contracts declare resource creation and object actions. Implementations bind the original declarations.

The preparation pipeline parses owner input, runs matching external preparers, then resource preparation. A replacement is new raw input and passes through the owner’s schema immediately. Accepted input proceeds to execution without redundant parsing.

Preparation receives read-only facades. Creation commits identity, initial state, and links together. Actions execute in the object queue. Current presence and execution scope are checked where an operation commits.

Frontend and backend operations use the same host mechanisms. A backend action call does not obtain the target’s private executor. A call in the current action chain back into the same target fails rather than deadlocking behind itself.

Creation can establish initial links and return the new identity plus its creation-time title. Tool creation automatically links the new object to the caller; optional initial resources stay within captured request access. Exposing the caller creates only that explicit reverse relationship.

Tool-scoped link changes manage the caller's exposure to a recipient within captured request access. The host binds the caller as the resource being shared; these operations grant no new access to the caller and leave the reverse relationship independent. Exposure can be established or withdrawn after creation. Existing requests retain their captured authorization, while later requests observe the updated relationships.

Renaming, removal, and link operations use shared host mechanisms for resource identity, presence, and lifecycle. Renaming appends a title event; existing snapshots retain the title at their captured timeline endpoint. Tool renaming and removal resolve targets within captured request links. Caller knowledge of an ID does not establish scope.

## Lifetimes and busy work

The host tracks application, session, and object lifetimes. Plugin shared services belong to its application lifetime; object-owned external instances belong to resource attachment.

Ending a lifetime signals cancellation, waits for dependent work, and runs registered cleanup in reverse order. A signal alone does not prove completion. Cleanup failure is reported while remaining cleanup proceeds.

Objects attach when they enter a running session's current resource set, including startup, wake, restoration, and cursor reconstruction. Card mounting is unrelated. Logical removal immediately changes discovery, closes frontend channels, and cancels the object's managed tasks and model requests. Captured request holds keep the instance available to borrowed tool operations until those users finish. Attachment lifetime termination and cleanup follow hold release. Reappearing objects initialize according to their resource implementation; history movement remains blocked while retirement is active.

Resource-owned busy work blocks session cursor changes and removal of that resource. Model requests capture resource capabilities and retain them through completion without automatically blocking history or making the access owner busy. The caller supplies a busy scope when its work depends on the timeline. These mechanisms do not determine domain execution state or sidebar notifications.

Visible activity has a separate lifetime from timeline occupancy, model requests, and notices. An execution activity scope belongs to an owned resource and remains registered until its work settles, including cancellation cleanup. Ending the resource or plugin lifetime signals cancellation and awaits that work; it does not remove the activity merely because cancellation was requested. Concurrent scopes remain independent, so one finishing does not erase another's activity. Activity registration alone neither occupies history nor emits a result notice.

An open instance can also publish activity without implying work in progress. Its owner releases the marker when the instance ends; changing viewers does not end that scope.

The consumer chooses the work boundary. An Agent wraps the whole task, including tool waits, retries, and compaction, rather than registering only individual model requests. Model-output streaming and activity progress are separate projections. Progress can describe a known fraction or return to indeterminate work without ending the scope. Success, error, and attention notices are explicit domain occurrences; cancellation alone is not a request for attention.

Object-bound managed tasks protect the timeline by default. External runtime tasks can opt out of history occupancy while retaining object ownership, cancellation, and cleanup. Busy scopes and request holds remain until real completion. Directed request holds account for concurrent consumers independently of Agent ancestry. Read-only communication does not become busy merely because it references an object.

Automatic session sleep waits until settled; archival cancels session work. Both end resource lifetimes and wait for retirement before recording their separate lifecycle states. Saved resource data, history, configuration, and links remain. Runtime resource reads and calls reject either unavailable state without waking it. A user open renews the sleep timer before reattachment. The normal plugin session list contains running sessions only; saved sleeping and archived sessions have separate metadata directories. These metadata directories do not grant runtime resource access.

Invalidating a projection publishes current domain state without creating a record or changing stored data. Within a transaction, publication follows successful commit.

Operation records separate fixed input from an eventual output. Publishing establishes their identity and position; completing fills the result once, including on an inactive branch, without moving the cursor. Session writers act within their plugin's ownership, while object writers also require the original emitting object. Record completion, content roots, and completion notifications share the transaction boundary. Snapshot readers preserve their captured pending state.

## Typed calls, events, and channels

Calls declare plugin or object scope. Object calls validate a full resource reference; omitting that reference does not turn them into plugin calls. Inputs and outputs validate at their responsible boundaries.

Call declarations retain both sides of their schemas. Invocation accepts raw JSON input and implementations receive parsed input. Implementations return raw JSON accepted by the response schema; each caller decodes that response into its result type. Schema inference preserves these distinctions for backend and frontend clients.

Input content is a separate call capability. The host binds its authority to the declared entry and retains referenced bytes for the call. Passing content IDs in business JSON does not grant access. Initial session records and current data acquire persistent ownership within their initialization transaction.

Calls remain independent of the object action queue, allowing answers to reach a waiting tool. Communication cancellation and business cancellation are separate. There is no default timeout or automatic replay.

Events carry contract, timestamp, host-stamped origin, and typed data. They are transient, nontransactional, and absent from history and model context.

Occurrence events preserve every event. Snapshot events may coalesce the latest pending value for the declared key. A subscriber processes its own queue in order; failures end that subscription.

Consumers subscribe and then query domain state. The event bus does not retain current state or replay a disconnected interval.

The host retains a runtime-only snapshot of live resource activities, separate from the transient event bus. Consumers establish their invalidation subscription before querying it, including after reconnecting. Reading activities does not require loading session bodies. Activity invalidation communicates that a reread is needed, not a replacement payload. Notices instead are one-shot resource occurrences: there is no persisted notification log or replay of notices missed while disconnected.

User-facing notifications and feedback belong to the feature that owns their meaning. Shared resource notices supply session reminders, not a unified notification service for every feature. Domain interactions retain their own state and presentation through resource views, transient toasts, inline feedback, or another appropriate form. The frontend consumes session notices on viewing and retains distinct notice kinds per resource until then. Consuming a reminder does not end activity or resolve an interaction.

Shared UI controls and plugin frontend views may call the shared Sonner instance directly for local interaction feedback. The application shell mounts and configures the shared toast container; sharing that implementation does not impose a common notification model on features. The event bus carries domain communication, not a uniform user-notification model. Host-stamped event origin does not itself require a visible source label.

System resume is a host occurrence delivered through the same event bus. The main process supplies the operating-system notification. The shared host deadline service rechecks wall-clock time on resume; plugins retain responsibility for domain-specific elapsed-time and missed-occurrence behavior.

Object channels support sustained bidirectional data. Opening validates current presence and plugin ownership. Closing, object disappearance, provider unavailability, or connection loss ends the channel. It neither writes history nor occupies the timeline by itself.

The host trusts installed plugins. It protects identity, history, and its declared interfaces without adding speculative quotas, silent overflow, or automatic business recovery.

## Absolute deadlines

The host provides one-shot absolute deadlines and cancellable registrations. Registrations end with the plugin lifetime; an optional resource lifetime signal ends them with that attachment as well. Cancellation removes a pending callback rather than interrupting one already running. The service is process-local, not durable storage or cron. Consumers persist deadlines and restore registrations from saved state when their resources attach.

## Provider services

Plugins contribute model connection presets, account usage providers, and web providers. The host owns catalog validation, shared service state, and lifecycle. Plugins choose how to compose these capabilities and present their results.

Preset additions and patches follow dependency and declaration order. Patches merge declared top-level fields and connection fields, with arrays replaced as wholes. Failed assembly removes the plugin’s contributions.

Usage providers distinguish active queries from response-header interpretation. Consumers supply the selected connection and credentials or response; the generic model service does not implicitly trigger account queries.

The host's shared usage service reads configured credentials, caches query results, and retains explicitly supplied header observations. Model requests use concrete provider/model targets. Role resolution and prompt composition belong to the requesting paradigm. The model runner accepts explicit messages and executable tools; session execution binds current resource access and linked context around it. The output observer owns recording, and workbench progress is an optional sink selected by the consumer.

Backend credentials remain explicit trusted-plugin capabilities. Plugin secrets are stored as given in the plugin's managed directory. Frontend consumption uses typed domain calls.

Plugins declare what their work used as usage subjects: a top-level tool through its call context, a model request through its request identity. The host records declarations with the current call or request and the declaring plugin; plugins supply only the subject. Invalid declarations are logged and omitted rather than failing the request or tool. Non-model metered charges use the separate external usage report. The usage-statistics design describes subject kinds, relations, and how the interface reads them.

## Persistence and content

Plugin-private files live under the plugin data directory. Managed configuration and a database are optional facilities, not prerequisites for plugin identity.

Data write boundaries encode decoded domain values through the declared Zod schema and validate the resulting JSON before saving or publishing it. Readers decode stored or transported JSON. Ordinary schemas use the same representation in both directions; synchronous codecs explicitly convert between representations. Operation-input parsing remains a forward-only boundary.

Storage declarations run before setup, separately from live services. A record migration operates on encoded data for the plugin’s own timeline contracts, not on runtime values or another owner’s data. Keep contract membership stable and preserve content references; read the prepared encoding through the ordinary contract. Unknown or unavailable records retain their stored payloads.

Configuration defaults and update callbacks use decoded values. File writes and configuration responses encode those values; frontend configuration readers decode the responses. Missing current-data rows remain distinct from a saved JSON null. Templates copy encoded state and data without applying another encoding pass.

Resource creation records separate host identity, kind, and card title from plugin-owned encoded state. The state accepts any JSON value and has no reserved business field names. Historical folding and snapshots preserve that separation. Renaming changes only the host title; template instantiation replaces host identities and relationships while preserving plugin state. Content retention follows references in the encoded state.

Template participation is explicit resource behavior. The resource declares which plugin-owned current-data contracts are reusable alongside its creation state. Object writers already require matching resource and data ownership; the resource author determines its own copy policy. Saving selects only those current entries. Instantiation validates the saved state and current entries against the installed policy before creating a session, preserves their encoded values, and remaps only host identities and links. Historical records, private storage, and running instances are excluded. Creation handlers are not replayed. External cloning, embedded-reference mapping, and restoration require explicit domain capabilities.

A resource may declare a synchronous title generator for template instances. This declaration omits the source title from saved templates and overrides any previously saved title at instantiation. Saving and catalog reads do not invoke the generator; previews show the resource type without an instance title. Without a generator, instantiation requires a saved title. The generated title enters ordinary resource creation history, so later reads and restoration preserve it.

Tool progress and terminal data use the same encoding boundary regardless of input kind. Typed renderers and model projections decode those payloads. Without a declared projection, a decoded string reaches the model as text and any other value as JSON text; only a declared projection can return model parts such as files. Resource tools and top-level tools share this rule. Non-null tool data cannot encode as null because the tool-result protocol reserves null for absent output.

The content service manages byte references and temporary retention. Public IDs alone grant neither access nor retention.

Content roots follow the actual encoded persistent JSON within the owning transaction. Historical decoding neither changes those roots nor grants access to references synthesized by a decoder.

## Renderer contributions

The renderer can contribute cards, tool phases, history records, creation entries, Home session entries, and independent settings pages. Frontend preparation can establish services independently of card mounting and binds them to a cancellation scope.

A Home session entry receives the host's folder selection and folder control. The entry renders the control where it fits its interaction and passes the selected folder to session creation; folder catalog and creation remain host behavior.

Frontend activation runs after backend publication. A stylesheet, import, or plugin preparation failure makes that frontend and its frontend dependents unavailable without deactivating accepted backend services. Module preparation failures retain the plugin's views and report partial initialization. Frontend outcomes belong to the current page and remain distinct from startup package outcomes; management presents both with stage-specific diagnostics.

Imported styles are explicit build dependencies. The builder records the admitted browser stylesheet closure, including styles reached through public entries. Startup preserves its association with the captured artifact, and the renderer loads it in dependency and registration order before preparing the frontend. Initialization failures and frontend shutdown release the associated styles; individual view mounting does not own them.

Plugins build independently. CSS Module names incorporate plugin identity and package-relative stylesheet identity so independent artifacts can share a document without relying on a final grouped renderer compilation. Artifact admission and provider failures exclude affected consumers without recompiling unrelated packages.

Plugins share the document's CSS cascade and host theme variables. CSS Modules localize class names without creating a separate rendering environment. Preprocessors remain the plugin's build responsibility; the host consumes completed CSS and serves bundled assets with their relative paths intact. Lazy chunks and supported URL assets remain bound to the captured build directory. This does not imply support for every computed resource path or arbitrary worker dependency graph.

Resource descriptions supply stable type presentation and optional location-opening behavior. The host resolves current resource identity and delegates opaque locations to the resource implementation, independently of model-request authorization. Target plugins own the resulting operations and views. Cards and auxiliary panels consume projected data; the host owns their surrounding layout, focus, and lifecycle.

A resource description can also provide targets for citation. A list provider suits a finite catalog whose entries can be filtered locally; a search provider suits a source whose candidates should not be enumerated up front. Search hits are already selected and ordered by the provider. The picker handles the interaction and encoding, while the resource owns the meaning of every location. Listing a target does not fetch its content or grant model access.

Retained object view state survives virtualized item remounts and container changes while that object remains present. Component-local state and persistent resource data remain separate.

Creation entries coordinate menu and drop input through the same host creation pipeline. Settings pages can open deeper host-managed islands and declare unsaved-state behavior.

Tool input, execution, and result phases share presentation identity but consume different data. Streaming-preview declarations request ordinary automatic disclosure; attention declarations request one immediate disclosure for user handling.

A tool can declare that each invocation needs user attention. The host raises that notice once when a validated call actually starts, independently of whether the tool requires an interaction endpoint or has visible running activity. It attributes the session reminder to the execution owner, not the tool's target resource. Viewing consumes the session reminder; a live tool shell can briefly highlight the call even while its session is already visible. Disclosure attention remains a renderer choice; execution notices do not depend on a mounted view or a body renderer. The notice neither suspends execution nor represents an unresolved business condition. Progress, completion, and domain-specific pending interactions retain their own lifecycles. In particular, the question service owns unanswered questions; viewing the session consumes attention without answering or cancelling them, and the sidebar does not maintain a second pending-question list. Notices remain transient and do not replay from history.

Agent-specific toolbar, overlay, and modal composition belongs to `@asterism-app/builtin-api`, not a generic SDK slot system.
