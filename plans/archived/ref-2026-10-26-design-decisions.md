# Decision history

Archived reference collected on 2026-10-26. This records earlier design choices and their reasons; section dates describe when those choices were made. Earlier interfaces, names, and mechanisms can have been superseded. The record preserves context for future work, not current implementation instructions.

## September 2026: product and execution foundations

On 2026-09-17, the product was defined as a personal agent workbench broader than coding. Cards represent useful objects, while tool calls remain primarily within conversations. Expanding every operation onto the canvas would impose continual layout work.

On 2026-09-18, Electron, React, TypeScript, React Flow, SQLite, Zod, and an independent task process were selected. A consistent Chromium environment supported the canvas; backend execution needed to survive view lifecycles. npm and electron-vite were chosen, with Forge initially handling packaging. AI SDK supplied protocol adaptation rather than persistent history.

Resource tools used fixed discovery and dispatch entries. Dynamic schemas could appear later in context without rebuilding the initial tool prefix. The initial three host entries were an implementation state, not a prohibition on future static plugin tools.

On 2026-09-19, environment capture was fixed at the model-request boundary, including that response's tool batch. Configuration and links changing during a response would affect the next request, preserving protocol pairing and a coherent capability view.

## Early October 2026: workspace and interface

Native materials, independent content surfaces, official controls, semantic tokens, and screen/island layout replaced ad hoc coordinates and custom window controls. Pure layout calculation centralized the behavior while native APIs handled platform integration.

Home became independent of sessions. The application loaded summaries first and created a session only when its first input was accepted. This avoided empty abandoned sessions and premature naming.

Provider connections, model roles, and agent configurations were separated. Sparse user overrides inherited original built-in defaults, not another effective user record. This allowed untouched defaults to improve without propagating accidental user edits across configurations.

The session-owned flat tree replaced per-Agent transcripts. Agents became resources without an intrinsic parent-child hierarchy. One historical path could reconstruct interleaved objects and directed links.

Text editing adopted line/hash anchors and atomic batch validation. Pierre Diffs replaced Monaco for frequent read-only code and diff displays because editor-instance cost was inappropriate for many conversation entries. Notes retained current text rather than claiming recoverable content history.

The 2026-10-10 brand choice was Atelier with a fixed application identity. It later changed to Asterism; the earlier identity is historical. Branding and internal identifiers were centralized to prevent accidental data-location changes.

## Mid-October 2026: host and plugin boundaries

The SDK centered on generic sessions, resources, records, and model services. Built-in and external plugins used the same interfaces. Agent messages, loops, completion projection, and naming stayed in the Agent domain so non-conversational plugins did not inherit those concepts.

Plugins were treated as trusted installed code. Shared public declarations used real module instances, not copied declarations accepted by matching text IDs. Explicit dependencies and lifecycle replaced a generic service locator, arbitrary string events, or a nominal security sandbox.

Snapshots became lightweight fixed observation boundaries. Record commits and cursor changes became separate notifications. The workbench's independent historical preview mode was removed so visible objects and execution had one active path.

Interface localization used FormatJS and ICU, with literal strings always valid and translations optional for external plugins. User interface content was the localization audience; developer diagnostics and model protocols remained stable English.

Immutable content references separated byte storage from business JSON. The host derived persistent roots from final validated values rather than trusting a duplicate manifest. Model input and tool results used text/file parts; service acceptance replaced stale client modality assumptions.

A typed transient event bus distinguished occurrences from coalescible snapshots. Sidebar status could update without loading full conversations or adding notifications to immutable history.

Explicit compatibility packs handled finite endpoint differences. Common text and reasoning survived model switches, while native continuation remained scoped. Arbitrary request processors and automatic brand inference were rejected.

Compaction became Agent policy using a separate summary prompt and retained boundary. It changed request projection without rewriting historical facts. Execution cost limits were removed; reference costs instead derived from recorded usage and current configured rates.

Card auxiliary panels gave diagnostics and supplemental views a shared local container. The resource supplied meaning while the host managed layout and focus.

Request diagnostics recorded structural counts and origins, not full prompts. Reported tokens and measured characters stayed separate. Local token estimates, proportional allocation of reported tokens, and reconstructed historical prompts were rejected as misleading evidence.

## 2026-10-15 to 2026-10-17: public extensions and conversation presentation

Built-in implementation, public domain API, and internal UI were split into separate packages. Static built-in compilation remained, with public provider bindings instead of exempting built-in imports from dependency checks.

Plugins could register top-level tools with host-bound call context. Forcing every operation through an Agent resource, adding a self-access exception, or requiring authors to replace the Agent would conflate addressing with extension.

Agent toolbar, overlay, and modal behavior belonged to the built-in domain API. A generic cross-resource UI slot framework was rejected because resource interfaces differ. Multiple hide-composer requests combined without merging business state; trusted plugins could retain an interaction without host-imposed force-unlock.

The first question tool joined top-level tools, typed calls, and Agent UI. User waiting had no blanket timeout because the model response had already ended. Persistent workflow recovery was not required for an in-memory wait. The Agent's whole-execution timeout was also removed, retaining cancellation and request-count limits.

Structured questions added single-choice, multiple-choice, text, custom answers, and review. Navigation did not imply submission or block browsing unfinished questions. Inline custom answers and one group-level note avoided redundant per-question editors.

Shared Agent scrolling and overlay surfaces centralized focus-ring space and alignment. Compact attachment rows preserved input height, with image previews on demand.

Session rows allocated actual width to visible status and actions rather than overlaying titles or reserving fixed empty space. Object headers became one compact line. Card hiding moved to the object panel to avoid confusing hide, remove, and stop.

Conversation configuration became one compact summary with local drill-down. Models were browsed by provider, with actual parameter previews rather than invented quality scores. Read-only counts used common engineering abbreviations while editable values stayed complete.

Request durations used monotonic measurement and retained timestamps for identification. Turn summaries aggregated eligible totals instead of averaging request rates. Only the final normal response body was copyable as the turn result; export and system sharing were separate scope.

Object focus moved content beside the canvas. Remounting was accepted instead of adding a mechanism solely to preserve component identity. A shared object-retention layer preserved user intent across view changes and released it when the object left the current path.

Theme changes initially used an accent-colored secondary surface. This was later refined into a separate selected token so ordinary labels could remain neutral. Graphite and additional palettes expanded choice without changing semantic roles.

Link styles became one global preference using existing path rendering. No per-link style storage or new routing engine was needed.

Tool overrides followed user plugin order independently of dependency initialization. A replacement contract disabled old implementations rather than mixing a new schema with old handlers. Reserved host routing remained distinct from replaceable plugin tools.

## 2026-10-18 to 2026-10-20: interface and configuration ownership

Persistent selection was separated from neutral secondary controls. Semantic foreground pairing addressed contrast without hardcoded white text.

A compact conversation minimap located inputs while preserving reading width. It reused existing controls and scroll ownership rather than adding another conversation container.

Workbench feedback was limited to meaningful waiting and failure states. Operation errors belonged to their entry, while read failures had one owner. Permanent ready badges and duplicate errors added noise.

LobeHub Streamdown supplied streaming pacing and animation through its public extension points. Application code supplied code, math, and diagrams without patching library timing. Mermaid used semantic theme variables rather than post-processing SVG.

Plugins gained their own settings pages and shared service scope. Automatic schema forms could not express account flows and complex interactions without becoming another UI language. Managed configuration remained optional and independent of a page.

The window layer owned titlebar mode, fullscreen, and platform control-safe regions. Official platform events and geometry were preferred to size guesses or custom controls.

Model catalog parsing became independent of inference protocol. Known response structures handled services sharing one catalog across several protocols, while unknown or malformed responses failed rather than guessing fields.

Thinking effort, manual budgets, and mode selection were separated. Protocol defaults worked without a pack; explicit mappings overrode finite fields without silent lowering or mode switching. Service acceptance ultimately determined valid explicit levels.

Model-level compatibility recommendation work was dropped. Verified presets guided ordinary setup; users choosing custom connections supplied their upstream requirements.

Generic creation and removal belonged to the host, while model-facing creation adapters belonged to the built-in domain. A creation entry could adapt inputs and initial links without a coarse creatable flag. Inspection was discovery, not an authorization handshake.

Presets stored finite editing rules in ordinary connections rather than a persistent brand/type identity. Catalog changes did not take over existing connections.

Preset providers, usage providers, and usage consumers were separated. Active queries and passive response-header observations shared result categories without sharing an obligatory cache or refresh policy. Header data could describe rate limits without pretending to be account balance.

## 2026-10-21: primitives, ordering, and domain state

Model descriptions distinguished selection information from usage guidance. Parameter text supplied business meaning beyond schema. Harness instructions described primitives; user workflows were not hardcoded as call sequences or negative restrictions.

Agent discovery kept identity, purpose, and examples. Detailed work instructions belonged to the selected agent. Creation-specific inputs stayed in their own entry rather than expanding a generic resource-creation envelope.

Creation views used resource type and the actual returned title. They did not guess an instance title from partial input. A readonly Agent investigation used its own fixed snapshot and utility-model search rather than invoking the target or borrowing its capabilities.

Request diagnostics moved into typed completion extensions saved with the highest-ordinal actual block. Separate diagnostics nodes could detach metadata from the response when branching. Empty-output failures remained transient instead of generating history solely for metering.

Persistent Agent drafts retained full intent through stop and restart. Steering at request boundaries and follow-up at turn boundaries remained Agent scheduling, not a new public suspend/resume system.

Busy state represented timeline-dependent work. Domain execution state and local UI pending were independent. Configuration or communication did not become Agent execution merely because it used an object facade.

Backend actions used a session invocation entry instead of exposing another plugin's private executor. Typed actions selected operation identity directly; duplicate operation discriminators were removed where the contract already supplied it.

Local writes adopted processing-order semantics. Runtime revisions, frontend generations, stale-result rejection, and file precommit rechecks were removed. These defenses changed ordinary single-user overwrites into errors without establishing a meaningful security boundary. Fixed format versions and real product conflict rules remained.

The renderer consumed ordered current-state updates rather than repeatedly invalidating and rereading complete sessions. Pending and cancellation handled entry lifetime. Late results followed actual handling order.

Links used a generic resource receiver instead of embedding Agent terminology in the host. Explicit caller exposure at creation formed a reverse link atomically, without granting all of the creator's resources.

Agent communication reused input admission with a structured sender. Resource identity already selected the receiver; names remained display data. Relay-internal addressing was left to a future relay implementation.

## 2026-10-22 to 2026-10-23: processes, transport, and MCP

Directory command execution used configurable noninteractive shell profiles and the directory as initial working directory. It did not promise confinement. Output retained a bounded tail and a temporary full log when needed, avoiding permanent storage of potentially huge logs or a dedicated log-query system.

Tool outcomes became feedback for the Agent rather than control over its lifecycle. Unknown effects and tool cancellation could lead to another model request; whole-Agent cancellation still propagated from outside.

Shared preview components and disclosure policy replaced per-tool copies. Successful command feedback emphasized output, with diagnostics retained separately rather than repeated in every response.

Interactive terminals used a shared PTY and backend screen for user and model input. Minimal shell integration identified prompt readiness; it did not invent command-output ownership. Resource presence, not card mounting, owned the instance.

Renderer/runtime MessagePort transport removed main-process forwarding from business traffic. Block/path deltas and frontend partial-argument parsing removed repeated transmission of accumulating output. Process heartbeat replaced blanket per-call transport timeouts.

Object channels supported bidirectional data and flow control. Reconstructed terminals remained inactive until opened; an exited shell was not silently restarted for the model. Screen state was transient and did not become host timeline busy state.

Public shared tools moved into the built-in domain API. Resource-specific targets expressed screen, buffer, file, or other locations. Terminal input remained separate from write because foreground programs consume input without necessarily making it persistent screen content.

Shell-profile discovery was a static query available before creating a terminal. A short observation window after input improved the returned state while preserving the difference between delivery and completion.

MCP used one shared application connection per server, a persisted discovery cache, and fixed resource entries. Eager/lazy controlled connection timing only. Search exposed unindexed candidates so a model could connect when necessary.

MCP configuration stayed in the application instead of importing multiple external formats. Server names and stable IDs were sufficient; an extra user-maintained purpose field was removed. Uniform cause-based errors replaced per-entry catch-all errors, without parsing private server output to invent semantics.

Resource access was explicitly described as context control, not an operating system permission system. Per-server or annotation-derived remote authorization layers would add complexity without confining already available terminals.

The host resolved login-shell environment once so desktop-launched subprocesses received useful paths. Plugins did not need a new environment helper. Plugin settings gained host-managed islands rather than exporting the entire screen layout system.

Notes used existing static Markdown rendering because they update as complete text and did not need streaming state.

## 2026-10-24: lifetime, history, and current observation

Conversation virtualization used a maintained library for dynamic measurement and position retention. Generated times became historical data; user view choices became object-retained state. Content-visibility and module-global state maps were rejected as incomplete substitutes. Selection across unmounted text remained a limitation.

Preview disclosure waited until meaningful content existed, reducing short-stream flashes. Providers declared preview availability; the shell owned the timing. Neither component existence nor each incremental update reset the disclosure decision.

Archiving ended session objects and removed the session from ordinary lookup through one presence boundary. Startup collection removed expired sessions and unreferenced content. A common lifetime scope replaced multiple ad hoc cleanup hooks. Immediate recycle-bin deletion and plugin-specific shutdown obstruction were unnecessary.

Content scanning recognized only complete reserved reference values, preventing schema descriptions containing the reserved field name from being misread as attachments. Raw error details retained actual HTTP status separately from SDK-derived status.

Model execution feedback appeared transiently at its occurrence; software faults used application notifications. Whether text had already been generated did not decide the feedback channel. Historical output remained factual rather than synthetic.

Configuration commands owned local pending/error state separately from shared read state. This avoided errors appearing in unrelated editors or disappearing after unrelated operations.

Templates stored static object data and relationships, not a session snapshot or running instance. Type-grouped covers were more legible than tiny full-canvas screenshots. Per-resource template export rules would duplicate resource ownership.

Readable configuration slugs replaced unnecessary random identities and display-name pairs. History and submission identities retained generated IDs because they lacked natural names.

Web search/fetch used plugin provider types and ordered routing. Provider-specific data stayed typed, and tool results reused ordinary history rather than a parallel cache/result database. The refined model configured each service type once, keeping its endpoint internal. Search selected the first eligible provider; only fetch used URL patterns.

## 2026-10-25: discovery, rendering, and release

Explicit Agent naming used a distinct source and protected the path from automatic renaming. A rename tool did not invoke another model or impose a fixed workflow.

Skill discovery built one shared catalog at startup or explicit refresh. Requests consumed names/descriptions and read selected package text on demand. Automatic scanning, full-body injection, dynamic skill tools, and a separate activated-skill state were rejected.

Skill source priority was user above plugin above built-in. Sources explained provenance in settings; names alone selected effective skills. Source namespaces and long file paths in every prompt entry were unnecessary.

The startup window appeared before backend readiness and owned visible failure handling. Whole plugin-build graphs could be reused when their tracked inputs matched. Entry-only/version-only fingerprints and another custom module resolver were rejected.

Directory search adopted packaged ripgrep rather than system lookup, startup download, or JavaScript fallback. Long-line excerpts retained full-line anchors. Search limits counted matches independently from context, and incomplete results did not imply no matches. A native binding remained deferred until Windows support was adequate.

Automatic naming moved to regular checkpoints because increasingly sparse milestones missed ordinary short-session evolution. Home onboarding checked conceptual configuration progress rather than imposing a second execution-validity gate or storing a completion flag.

The then-current Atelier icon used a baked glass-frame composition. Several proportions and colors were rejected for device-like appearance or poor glass contrast. Later Asterism branding retained it only as a placeholder.

New-card placement preserved spatial memory; explicit ELK arrangement handled full-layout repair. Shared geometry prevented backend placement from using undersized rectangles. Dagre was lighter but less flexible; force layout would add collision/convergence work. ELK was loaded on demand.

Graphite became the default appearance, with platform-based initial corner radii. Saved choices remained authoritative. Untitled agents used generated two-word display names without global uniqueness checks or model calls.

Send results retained receiver meaning while submission IDs stayed internal. Thinking menus described known choices without locally rejecting existing explicit levels or silently lowering them.

Web body budgets belonged to the common service; upstream limits and mapping stayed in adapters. Actual truncation remained distinct from merely requesting a length limit. Excerpts were not implicit filters over the body.

Packaging moved from Forge to electron-builder with electron-updater. Fixed self-signing and GitHub assets supported update delivery without an Apple membership prerequisite, subject to real installed acceptance. Stable/prerelease choices shared application identity and data; development runs alone used separate data.

GitHub release markers plus SemVer selected candidates before delegating download/install to the updater. The titlebar exposed status while About grouped version, updates, and logs. Installation required a separate explicit action.

## 2026-10-26: preparation, distribution, and documentation

Version-based data preparation ran before business services. It did not duplicate business-schema or full-integrity checks on every startup. Plugin storage entries were separate from runtime setup; one plugin's migration failure did not prevent unrelated application use.

Recovery points preserved the whole persistent data group, with immutable-byte sharing and cold database copies. Restoring paused automatic migration until an explicit retry. Missing versions were not silently treated as a migration starting point. Development rebuild policy remained distinct from future user-data migrations.

Preparation completion and process exit were separate facts. Main received the final result, ended the preparation process, and confirmed exit before starting the business runtime. Startup stages, settings availability, and logs had explicit owners rather than one frontend deadline covering migrations.

Settled turns folded process entries behind a summary while retaining final output, feedback, and compaction markers. The virtual list still owned position and measurement. Compaction used its retained boundary rather than the later summary append position for a fresh reading window.

The brand changed from Atelier to Asterism. Package names, application identity, namespaces, manifest fields, and content identity adopted the new name together. Internal-development status allowed a direct identity change rather than old-name aliases; real cleanup still required authorization.

Internal prereleases would first verify updates, migration, and recovery. Sharing with friends began the user compatibility obligation even before stable release. A stable label alone was not the relevant data boundary.

Release version and notes moved from PR metadata to main's first-parent commits, covering both direct and squash commits. The initial target was fixed independently of development breaking changes. Publication eligibility, version impact, and note inclusion remained separate. Manual and scheduled runs retained the same eligibility rule.

Documentation was separated into an English internal manual and English engineering material. The manual offers independent conceptual guides for models helping users or authoring plugins. Engineering material explains development principles and responsibilities. Neither collection should depend on cross-document links or per-file source indexes; models can retrieve and combine current information themselves. Stable directory maps can explain organization and responsibilities. Resource/tool access to the manual was explicitly deferred.

## Unresolved directions at this record's close

Outstanding decisions included formal resource-addition/access interaction, relay and delegation composition, captured-resource checkpoints and restoration, complete-request retention and sensitive-data policy, and whether internal shared UI should become a public compatibility promise.

Large tool catalogs, branch-heavy history, and many simultaneous cards still needed real scale evidence. Existing cost displays, direct communication, and virtualization were no longer appropriately described as wholly unimplemented features.
