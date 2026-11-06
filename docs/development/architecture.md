# Architecture

Asterism separates application composition, generic host mechanisms, and plugin domains. Each layer has its own responsibility and dependency boundary.

## Technology and processes

Electron hosts a React and TypeScript interface. SQLite stores structured application data, and local files store immutable content. Zod validates boundary data. Vercel AI SDK adapts model protocols without owning conversation history.

The project uses npm, electron-vite for compilation, electron-builder for packages, and electron-updater for installed updates.

| Process or entry | Responsibility |
| --- | --- |
| Main | Windows, platform integration, data paths, process supervision, and shutdown |
| Preload | Restricted desktop bridge and transfer of the runtime connection |
| Preparation runtime | Storage preparation and recovery before business services start |
| Business runtime | Database, application services, execution, tools, and plugin host |
| Startup renderer | Startup and recovery UI |
| Application renderer | Deferred application composition and workbench UI |

Backend work survives page navigation. Closing the last window shuts down the runtime before exiting. A runtime crash requires an application restart.

The main process resolves the login-shell environment before starting the runtime; Windows retains its inherited environment. Shells, terminals, MCP servers, and plugin child processes inherit the resulting environment. Failure is logged and retains the original environment.

## Composition boundaries

The host and SDK must remain independent of Agent paradigms and import no builtin packages. Agent turns, role resolution, request composition, and conversation behavior belong to paradigm plugins. A paradigm can represent its Agent as a workbench resource or choose another representation.

The built-in implementation uses the SDK and `@asterism-app/builtin-api`. External plugins use the SDK and their declared public dependencies. Public API packages do not import implementations, and the SDK imports no host implementation.

Builtin supplies the official paradigm, Agent forms, and capability compositions as an ordinary bundled plugin. Users can disable it and develop or install another paradigm. Distribution alongside the application grants no special domain recognition, identity, validation, or lifecycle. Contributions use the same plugin mechanisms.

A capability belongs in the host when its meaning is independent of Agent paradigms and it has application-wide configuration or shared state. The host owns that configuration and state; the SDK defines domain types and capabilities; plugins own resources, tools, views, model-facing text, and capability composition. Stateless helpers remain library or plugin code. Interfaces follow current consumers rather than hypothetical feature sets.

Model calls, terminal sessions, and MCP calls are composable capabilities. Builtin can build a conversation card from model calls; another plugin can combine model calls with a terminal in one resource. Shared services do not prescribe card types or a one-to-one relationship between services and resources. Skill and instruction catalogs retain raw contributions with plugin provenance; consuming paradigms determine effective request contents.

## Sessions and entry ownership

A session is the time and space of the user's work: its history and workbench. The host owns session identity, titles, history, resources, static resource templates, automatic sleep, and recycle-bin retention independently of conversations. Its shared deadline service owns process-local absolute wakeups; plugins own durable schedule state and missed-occurrence behavior.

Home hosts plugin-declared entry interfaces. The plugin owns its controls, business validation, preparation, and session assembly, including the initial title. Backend plugin operations perform that assembly through generic host capabilities. The host retains contract validation, authorization, persistence, and lifetime enforcement.

Session preparation finishes before persistent initialization. A synchronous transaction creates the session, prepared resources, initial records, and retry receipt together. Retry identities belong to the contributing plugin. Attachments retain explicit content authority through preparation and become persistent only through their saved references.

Home displays the sole available entry directly. With several entries, the user chooses one in General settings. An unavailable selection requires a new choice rather than silent replacement. Without an entry, Home explains that a paradigm plugin is required and retains access to templates. Template instantiation uses resource declarations independently of the selected entry.

Automatic naming belongs to the paradigm that defines its triggers and material. Builtin uses Agent-turn triggers and its utility role, then updates the host-owned title through generic capabilities. The host needs no automatic-naming strategy registry.

## Settings ownership

Settings home contains host pages and plugin-declared configuration pages. Each plugin page identifies its contributor; Roles, for example, belongs to builtin. Plugins may contribute several pages or none.

A Plugins card opens a plain management list with plugin information and enablement controls. Settings home has no separate plugin list beneath its page entries, and plugin management items do not act as configuration-page cards.

## Application networking

Network preferences belong to the host and apply at startup. System proxy mode follows operating-system proxy resolution, including automatic proxy rules. Direct mode bypasses proxies. Custom mode supplies one HTTP, HTTPS, or SOCKS5 endpoint and Chromium bypass rules. Loopback destinations retain Chromium's default direct routing. Proxy credentials are not part of this configuration.

The main process applies the same preferences to application networking, renderer requests, and the updater's separate download session. Runtime fetch requests use a process-wide Undici dispatcher; the main process resolves each destination through Chromium, including destinations reached by redirects. Runtime routing uses the first resolved proxy and reports connection failures. It does not replay requests through alternate proxies or share Chromium's failed-proxy cache.

Model execution, provider discovery and probes, builtin web and usage providers, and HTTP MCP consume this shared runtime transport. Node fetch retains ownership of request bodies, response streams, cancellation, and redirect semantics. Plugins using the default fetch transport participate automatically. Independently configured clients, raw sockets, terminals, and external MCP processes retain their own networking behavior. Application proxy settings do not change the inherited shell environment or provide operating-system traffic interception.

Saving preferences preserves the active process configuration until restart, so in-flight work keeps its transport. Proxy resolution and connection pools end with the task runtime.

## Startup and loading

Startup follows dependency order:

1. Acquire the application lock, initialize logging, and start data preparation.
2. Create the window when host-storage status determines whether saved preferences are usable or recovery UI is required.
3. Finish preparation, resolve the login environment, and start the business runtime.
4. Load packages, open storage, perform startup collection, assemble plugins, and attach resources from active sessions.
5. Report runtime readiness, establish the renderer’s direct connection, prepare frontend plugins, and mount Home.

Data preparation advances by actual work, independently of ordinary startup deadlines. The preparation process sends its result after committing and releasing resources. Main confirms process exit before continuing; an intentional exit does not overwrite an already received result.

The startup coordinator owns stage, failure, and cancellation state. Consumers subscribe before reading current state. Refreshing the page can therefore retrieve an existing failure.

Network services started by plugin tasks can continue after Home appears. Their connectivity is not a prerequisite for the whole application becoming ready.

Deadline values and process supervision belong to the coordinator implementation. A timeout ends its owning startup scope and surfaces failure rather than repeatedly extending a deadline on progress.

Main aggregates logs from itself and child processes in `logs/runtime.log`. Records include startup identity, process, severity, and English diagnostics. Logging remains available during storage failures.

Fatal interface initialization and rendering errors report their JavaScript and component stacks through the trusted desktop bridge into the same log. Reporting these failures is independent of the business runtime connection.

## Plugin build artifacts and native tools

Each application startup discovers the configured packages and resolves their current sources with the compiler. Content-addressed build artifacts and a serializable package graph capture that startup's entries, dependency relationships, catalogs, and manual declarations. Storage preparation and the task runtime consume this same build; the runtime imports its captured entries without rediscovering or recompiling packages.

Bundled packages use the ordinary package list, validation, compilation, and enablement mechanisms. A plugin can provide its own public export or declare separate public API libraries. Package-name ownership is unique across both mechanisms, and the enabled provider supplies the shared module instance in each environment.

The host's shared UI module table is generated from the package's existing exports, including subpath patterns. Discovery enumerates files without evaluating them and generates imports only for public entries. Test files use the reserved `.test.` filename marker; discovery and distribution exclude them, while compilation rejects explicit runtime imports of tests or the test runner.

Artifact reuse is scoped to the current startup. A later startup resolves sources and dependencies again, including newly installed packages and changed resolution candidates. Before the task runtime starts, preparation removes older artifact directories that the current build no longer references. Build artifacts contain neither running instances nor service state.

Native helpers such as ripgrep and PTY binaries ship for the target platform outside asar. Runtime execution uses packaged binaries rather than downloading or finding an arbitrary system replacement. Packaging must retain target-specific optional dependencies.

Runtime dependencies with native binaries or package-relative assets can remain external to a plugin bundle. Their resolved installed paths remain intact. Bundled source packages and their compilation dependencies are available at physical installed paths, independently of the writable plugin cache.

## Storage ownership

Application identity and data layout are centralized. Development and installed runs use separate Electron data directories. Update channels share the installed directory.

| Data | Owner |
| --- | --- |
| Global model, provider, and other paradigm-neutral shared configuration | Host configuration services |
| Roles, Agent configurations, and other paradigm-specific configuration | Owning plugin through generic plugin storage facilities |
| Appearance, language, update and network preferences, window cache | Main process |
| Credentials and credential-command expressions | Saved with their owning entry: host configuration or plugin storage |
| Session tree, current data, templates, view state, content roots | Runtime SQLite database |
| Immutable bytes | Runtime content store |
| Plugin-private data | Plugin directory and optional host-managed facilities |
| Recovery points | Data preparation service |
| Chromium data | Electron session storage |

Global configuration survives replacement of the session database. Host connection credentials and MCP OAuth state are saved in configuration; plugin secrets are saved in plugin storage. Literal credentials and credential-command expressions remain with their owning entries. These files and their recovery points can contain sensitive data; they are not sanitized configuration exports.

SQLite has one runtime writer, WAL, and foreign keys. Session deletion cascades its history, cursor selections, current data, views, and content roots. Templates own separate content roots. Folder deletion clears the membership of its sessions and templates.

Application metadata and historical records share synchronous transactions. Filesystem effects do not participate in a cross-medium transaction. Current local writes use processing order and last-write-wins semantics, without revision-based conflict protocols.

## Data preparation

Each persistent format has its own version constant. Preparation reads versions rather than validating business data shapes. Missing files remain absent until their owner creates them.

During internal development, incompatible data can be rebuilt within explicitly authorized cleanup scope. The first distribution to users, including sharing a prerelease with friends, establishes the continuous migration obligation. Internal maintainer test releases alone do not establish it.

Migrations form consecutive n-to-n+1 steps. Validate the entire path before conversion. JSON commits with atomic file replacement; SQLite commits the chain and version update in one transaction. Released steps remain stable and do not call mutable business helpers.

Prepare host storage before plugin storage. Host failure opens recovery UI without starting business services. A plugin storage failure disables that plugin for the startup and reports the reason; unrelated plugins continue.

Before migration, save a complete recovery point of persistent application data with database connections closed. Caches and logs are excluded. Sealed immutable content can share bytes through hard links; unsupported filesystems use copies. Completion metadata is written last.

Restoring or starting fresh first preserves current data in another recovery point. Interrupted operations can resume. Restoration pauses automatic migration until an explicit retry, avoiding a recovery loop. Retention and recovery paths belong to the storage implementation.

Recovery points cover application data, including locally stored credentials and credential-command expressions. External files and service effects are outside that guarantee.

## Direct runtime transport

Main transfers a MessagePort between the renderer and runtime. Business requests and updates use that direct connection; main retains startup, supervision, and shutdown traffic.

On macOS, closing the window destroys its renderer and disconnects its transport while main and the runtime keep running. Dock activation or relaunching the running application recreates the window and connects it to current runtime state. Unsaved frontend edits require confirmation before the renderer unloads. Explicit application quit stops the runtime through the normal shutdown flow. On Windows and Linux, closing the window initiates application quit.

Commands validate at their owning boundary. Trusted runtime push frames use structured cloning and do not undergo redundant per-frame schema validation.

A connection multiplexes commands, configuration, content transfer, events, calls, and object channels. Disconnection cancels its subscriptions and communication work and releases transfer state.

Requests are sent once and are not automatically replayed. Requests have no transport deadline, and main does not probe runtime liveness. The runtime becomes unavailable only when its process exits or reports a fatal error.

## Current state and streaming

Frontend subscribers establish the stream before requesting current state. Initial state and later changes arrive through the same ordered connection. Resource changes carry current projections; structural changes and cursor moves carry the reconstructed workbench.

Session views share one fixed observation per session. Opening a session transfers the complete record metadata tree and captured pending bodies; finalized bodies are read by identity as consumers request them. Metadata supports ancestry, provenance, and navigation without loading historical payloads. Concurrent frontend reads share finalized bodies, and unused bodies can be collected when their readers release them.

Backend and frontend history readers use the same scope, range, identity, provenance, and paging semantics. Backend reads are synchronous within the runtime; frontend body reads are asynchronous and expose loading and failure separately from empty results. Pending observations belong to their captured snapshot and never share a finalized body's cache entry. Reconstructible backend indexes can be released when a session is neither observed nor running, independently of resource attachment and external processes.

Query selection has one implementation shared by storage and memory readers. Paradigms own their history selection and projection flows; local and remote execution of those flows differ only in how bodies are obtained. A session's record owner applies appended and completed records, captures observations, and shares cached bodies. Views own reading windows and presentation continuity.

Commands return when their action completes, independently of the view update. Each UI entry owns pending state. Input submission identity supports exact retry without duplicating accepted input.

Streaming deltas align by response and block identity. Progress materialization is batched within the response lifetime, and terminal transitions flush outstanding progress. Persistent records arrive before removal of their live counterparts; readers retain the last live observation while the corresponding saved range is loading. Partial arguments are display-only; execution uses validated complete arguments.

## Releases and updates

GitHub Releases stores platform installers and update metadata. Installed builds select a higher semantic version allowed by the chosen stable/prerelease channel. Changing to stable does not downgrade an installed prerelease.

Checks and downloads use the preference captured at their start. Installation requires an explicit action, normal resource-exit confirmation, and completed runtime shutdown. Main owns the restarting state through cleanup and installer handoff; cancellation restores the ready state, and failures remain visible.

macOS builds use a fixed self-signed identity supplied through CI secrets.

## Trust boundaries

The renderer uses restricted desktop capabilities and direct validated business commands. Main accepts trusted-window main-frame requests. Navigation, browser permissions, and external link opening follow explicit allowlists.

Published content uses controlled rendering: untrusted HTML is not executed, KaTeX uses untrusted mode, and Mermaid uses strict rendering. Remote images do not broaden script or connection policy.

Resource authorization defines model context and operation scope, not an operating system sandbox. Shells, terminals, MCP servers, and trusted plugins run with the current user’s capabilities. Asterism does not implement a general permission model or agent behavior audit.

Credentials are stored as entered in host configuration with owner-only file permissions; external credential managers are reached through user-configured commands. Raw keys remain separate from history and diagnostics.
