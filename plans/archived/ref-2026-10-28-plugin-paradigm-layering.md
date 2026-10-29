# Plugin paradigm layering

Filed on 2026-10-28. Design for restructuring host and paradigm responsibilities; implementation is tracked by the plans listed at the end.

Disposition: consumed by the completed restructuring. The rationale and readiness sections below preserve the pre-implementation state. The corresponding implementation records are archived with automated verification results and outstanding manual acceptance caveats.

## Decision

Asterism is a plugin-based Agent workbench. The host supplies plugin mechanisms and paradigm-neutral shared services. Agent paradigms are plugin features. Builtin supplies the official paradigm, Agent forms, and capability compositions as an ordinary plugin bundled with the application. The host does not recognize builtin as a special domain. A user can disable it and develop or install another paradigm plugin.

## Rationale

The current code mixes two directions. Shared services such as MCP, skills, and shell configuration live inside builtin and its settings page, while paradigm concepts live in the host and SDK: Roles and Agents settings are host categories, `ModelTarget` addresses models by role, `PromptBlock` has an `agent` kind with a role, Home creates a builtin Agent and runs builtin prompt assembly for preflight, and about twenty host files import `@asterism-app/builtin-api`. Another paradigm plugin cannot replace the Agent design, because the host keeps presenting builtin's configuration model.

The alternative, a host that owns every Agent concept with builtin reduced to a provenance wrapper, would make one Agent design permanent and retire `builtin-api`. The plugin direction keeps paradigms replaceable and lets other authors define their own. Data left by a disabled paradigm uses the existing fallback for unavailable plugins, as for any other plugin.

## Placement criterion

Apply these tests to every concept, including ones not listed below and future additions.

1. **Paradigm test.** Ask whether the concept keeps the same meaning under a different Agent paradigm, including one that does not model Agents as workbench resources. A concept whose meaning depends on how one paradigm structures Agents, requests, or conversations belongs to that paradigm's plugin.
2. **Shared-state test.** A paradigm-neutral concept enters the host only when it has configuration the user manages once for the application, or state that several plugins share: configured lists, connection pools, catalogs, long-lived processes. A stateless helper remains library or plugin code.
3. **Layers.** A host concept splits into four layers:
   - Configuration: host settings UI and host storage.
   - Domain model: SDK types and their semantics.
   - Capability: SDK services on the plugin context, returning handles, streams, and data.
   - Usage: plugins. Resources, tools, cards and views, model-facing descriptions and prompts, and compositions of several capabilities.

   The SDK decides no presentation and writes no model-facing text; those are usage. A plugin may expose a capability as a resource, build it directly into its own interaction model, or combine it with others. Model `run` and `stream` already follow this shape. Builtin composes model operations into an Agent conversation card; another plugin could combine model operations and terminal sessions in one terminal resource with its own Agent conversation. Capabilities do not prescribe resource types or a separate card for each service.
4. **Abstraction scope.** The paradigm and shared-state tests decide placement; current real consumers decide interface shape. Expose the operations those consumers need and add operations when a consumer requires them. Hypothetical uses check that an interface does not encode one consumer's usage; they do not justify additional operations.
5. **Authorization.** SDK capabilities grant no model access. Model-visible scope still comes from resources and links that plugins expose. Plugins already run as the current user, so moving a capability into the SDK creates no new security boundary.

## Ownership

| Owner | Responsibilities |
| --- | --- |
| Host and SDK | Plugin runtime, sessions and titles, history, workbench, static resource templates, authorization, routing, storage; providers, models, and thinking levels; provider usage queries; web providers; skill catalog; instruction contributions; MCP configuration, connections, state, and calls; manual sources; shell profiles, interactive terminal sessions, and command execution; plugin-declared settings pages; Home container and session entry arbitration |
| Builtin paradigm and `builtin-api` | Roles, Agent configurations, and their settings pages; Agent resource, execution loop, compression, peek, send, wait, and Mesh; request preparation; its Home entry interface and session assembly; automatic naming triggered by Agent turns using the utility role |
| Builtin usage of host services | Terminal resource, directory exec, MCP Host and Manual resources, usage display; filesystem, notes, and questions, which need no host state |

## Specific decisions

- **Model access.** SDK model operations take a concrete provider, model, and thinking level. A missing model is an error. Role resolution and per-Agent overrides belong to builtin.
- **Prompt blocks.** SDK prompt data carries source and text without paradigm-specific kinds. Builtin defines its own structured blocks and request measurements.
- **Sessions.** A session is the time (history) and space (workbench) of the user's work. Session identity, title, history, and workbench belong to the host independently of conversations or Agent turns.
- **Session entry.** Plugins declare Home entry interfaces through the SDK; the host owns their container and selection. With one entry, Home displays it. With several, the user selects one in General settings. When the selected entry's plugin is disabled or removed, Home asks for a new selection rather than switching silently. Without any entry, Home reports that an Agent paradigm plugin is required; host template access remains available. The entry can start work through a conversation, directory selection, task form, terminal, or another interaction. The host defines no universal first-message input.
- **Entry execution.** The plugin owns entry controls, draft state, business validation, preparation, and session assembly, including the initial title. Its interface can call plugin backend operations that use generic host session and resource capabilities. The host retains contract validation, identity, authorization, storage, and lifetime enforcement, but performs no paradigm-specific preflight. Builtin's entry owns its Agent/model choices and input validation; request validation uses the same assembly entry as its ordinary requests.
- **Session naming.** Initial titles come from the entry that assembles the session. Builtin owns automatic naming, its Agent-turn trigger, and its utility role selection. It updates titles through generic host capabilities. The host needs no automatic-naming strategy registry and does not interpret builtin naming records or call builtin for user title changes.
- **Templates.** Templates belong to the host because they describe static session and resource structure. Instantiation uses resource declarations and does not require a paradigm's Home entry or a synthetic initial conversation.
- **Terminal and shell.** Host settings own shell profiles: executable, arguments, environment, and the default selection. Appearance settings already own terminal typography. The SDK exposes profiles as `plugin.terminalProfiles`, together with interactive terminal sessions (start, input, resize, screen observation, shell readiness, end) and one-shot command execution with streamed output, cancellation, and timeout. These interfaces are shaped from the two current consumers, builtin's Terminal resource and directory exec.
- **Provider usage.** Querying and caching provider usage belongs to the host next to providers. Toolbar display and per-response consumption are plugin usage.
- **Settings pages.** Remove the plugin list beneath the settings home and the design where a plugin card opens its settings. A normal Plugins card on the settings home opens a plain management list with plugin information and enablement controls. Plugins separately declare configuration-page entries on the settings home. For example, Roles is attributed to builtin and opens builtin's configuration interface. One plugin can declare several pages or none.
- **Skills and instructions.** Skills and instructions are model-domain concepts shared across paradigms. The host collects raw skill sources and instruction contributions through `defineAgentSkills` and `defineAgentInstructions`; it supplies catalogs rather than a universal request composition policy. Contribution identity comes from the actual registering plugin context and remains on each entry for provenance. A paradigm chooses and assembles contributions for each request. Builtin exposes ordered preparers that edit its flattened lists, which keep provenance, before projection.
- **Manuals.** The `asterism.manual` manifest field stays; the host owns the source collection and builtin's Manual resource reads it through the SDK.
- **`builtin-api`.** Remains the official paradigm's public API for plugins that extend the builtin Agent.
- **Compatibility and storage.** The maintainer confirmed that previous distributed versions were test builds and establishes no compatibility or migration requirement for this restructuring. Implement the final contracts directly, without legacy adapters or migration work. This scope does not authorize deleting real development or installed data.

## Implementation readiness

Session naming and Home entry ownership are decided. The implementation plans can proceed against these boundaries. SDK declaration shapes and internal decomposition follow actual consumers; they are implementation work rather than unresolved product choices. Home and settings presentation still require manual acceptance.

The engineering documents state the approved ownership requirements; their presence does not mark the implementation tasks complete. Current code still includes builtin imports in the host, host-owned roles and Agent configuration, a fixed Home conversation composer, and builtin-owned shared services.

Implement settings-page declarations first so configuration can move to its owner. Establish skill/instruction collection and builtin's single request assembly entry before wiring the extracted Home entry to it. Extract paradigm configuration, concrete model targeting, Home entry, and naming ownership, then complete the remaining shared-service moves. The final dependency check follows all tracks: the host and SDK import no builtin packages, builtin can be disabled, and another entry can use shared capabilities without builtin's Agent representation.

## Implementation plans

- `plans/archived/todo-2026-10-28-plugin-settings-pages.md`
- `plans/archived/todo-2026-10-28-agent-skills-instructions.md`
- `plans/archived/todo-2026-10-28-agent-paradigm-extraction.md`
- `plans/archived/todo-2026-10-28-host-shared-services.md`
