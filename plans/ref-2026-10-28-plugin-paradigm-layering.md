# Plugin paradigm layering

Filed on 2026-10-28. Design for restructuring host and paradigm responsibilities; implementation is tracked by the plans listed at the end.

## Decision

Asterism is a plugin-based Agent workbench. The host supplies plugin mechanisms and paradigm-neutral shared services. Agent paradigms are plugin features. Builtin is the official paradigm and receives no host coupling or special lifecycle; a user can disable it and use another paradigm plugin instead.

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

   The SDK decides no presentation and writes no model-facing text; those are usage. A plugin may expose a capability as a resource, build it directly into its own interaction model, or combine it with others. Model `run` and `stream` already follow this shape.
4. **Abstraction scope.** The paradigm and shared-state tests decide placement; current real consumers decide interface shape. Expose the operations those consumers need and add operations when a consumer requires them. Hypothetical uses check that an interface does not encode one consumer's usage; they do not justify additional operations.
5. **Authorization.** SDK capabilities grant no model access. Model-visible scope still comes from resources and links that plugins expose. Plugins already run as the current user, so moving a capability into the SDK creates no new security boundary.

## Ownership

| Owner | Responsibilities |
| --- | --- |
| Host and SDK | Plugin runtime, history, authorization, routing, storage; providers, models, and thinking levels; provider usage queries; web providers; skill catalog; instruction contributions; MCP configuration, connections, state, and calls; manual sources; shell profiles, interactive terminal sessions, and command execution; plugin-declared settings pages; session entry arbitration |
| Builtin paradigm and `builtin-api` | Roles, Agent configurations, and their settings pages; Agent resource, execution loop, compression, peek, send, wait, and Mesh; request preparation |
| Builtin usage of host services | Terminal resource, directory exec, MCP Host and Manual resources, usage display; filesystem, notes, and questions, which need no host state |

## Specific decisions

- **Model access.** SDK model operations take a concrete provider, model, and thinking level. A missing model is an error. Role resolution and per-Agent overrides belong to builtin.
- **Prompt blocks.** SDK prompt data carries source and text without paradigm-specific kinds. Builtin defines its own structured blocks and request measurements.
- **Session entry.** Paradigm plugins register session entry handlers through the SDK; the host arbitrates. With one handler, Home uses it. With several, the user selects one in General settings. When the selected handler's plugin is disabled or removed, Home asks for a new selection rather than switching silently. Without any handler, Home reports that an Agent paradigm plugin is required. The handler creates the session from Home's first input; later failures belong to the paradigm. A handler that validates first input uses the same assembly entry as its ordinary requests.
- **Terminal and shell.** Host settings own shell profiles: executable, arguments, environment, and the default selection. Appearance settings already own terminal typography. The SDK exposes profiles as `plugin.terminalProfiles`, together with interactive terminal sessions (start, input, resize, screen observation, shell readiness, end) and one-shot command execution with streamed output, cancellation, and timeout. These interfaces are shaped from the two current consumers, builtin's Terminal resource and directory exec.
- **Provider usage.** Querying and caching provider usage belongs to the host next to providers. Toolbar display and per-response consumption are plugin usage.
- **Settings pages.** Plugins declare settings pages on the settings home with source attribution. The plugin category lists plugins with information and an enable switch, without per-plugin settings bodies.
- **Skills and instructions.** The host collects raw skill sources and instruction contributions through `defineAgentSkills` and `defineAgentInstructions`. A paradigm flattens them for each request. Builtin exposes ordered preparers that edit the flattened lists, which keep provenance, before projection.
- **Manuals.** The `asterism.manual` manifest field stays; the host owns the source collection and builtin's Manual resource reads it through the SDK.
- **`builtin-api`.** Remains the official paradigm's public API for plugins that extend the builtin Agent.
- **Storage.** No build has been distributed beyond the maintainer. Current formats can be rebuilt without migration; the continuous migration obligation starts with the first real distribution. Real development data cleanup still requires explicit authorization.

## Open questions

Resolve these with the user before implementing the affected step.

- **Session naming.** Session titles are host session data. Decide whether model-generated naming becomes a host entry with a plugin-supplied strategy or remains builtin usage.
- **Home composer controls.** Decide whether a session entry handler contributes paradigm-specific Home controls, such as Agent and model choices, and how Home presents them.

## Implementation plans

- `plans/todo-2026-10-28-plugin-settings-pages.md`
- `plans/todo-2026-10-28-agent-skills-instructions.md`
- `plans/todo-2026-10-28-agent-paradigm-extraction.md`
- `plans/todo-2026-10-28-host-shared-services.md`
