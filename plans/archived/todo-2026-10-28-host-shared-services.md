# Host shared services

Filed on 2026-10-28. Decision and placement criterion: `plans/archived/ref-2026-10-28-plugin-paradigm-layering.md`.

Each service follows the criterion's layers: host configuration and settings page, SDK domain model and capability, builtin usage. Define each SDK interface from builtin's current consumers; caches, process supervision, and reconnection stay internal.

## Terminal and shell

Host settings own shell profiles and the default selection. Terminal typography stays in appearance settings. The SDK exposes `plugin.terminalProfiles`, interactive terminal sessions, and one-shot command execution. Builtin's Terminal resource and directory exec become adapters.

- [x] Move shell profile configuration out of `BuiltinSettings.shell` into host configuration and a host settings page.
- [x] Move profile resolution, process start, and piped execution into an SDK capability with streamed output, cancellation, timeout, and settling.
- [x] Move the PTY session, screen state, and shell-readiness integration into an SDK capability; builtin keeps the resource, card, tools, and model-facing text.
- [x] Retain resource disposal, restart configuration, shared user/model session, and native binary resolution in the moved implementation. Native behavior in an installed application remains manually unverified.

## MCP

The host owns server configuration, credentials, connections, discovery cache, state, and calls, with the settings page. Builtin's MCP Host resource and tools adapt the service to resource links.

- [x] Move configuration out of `BuiltinSettings.mcp` and credentials out of builtin secrets.
- [x] Preserve current contracts: cancelling one call keeps the shared connection for others; a captured call keeps its server and tool identity across configuration edits; connection failure does not replay a call; OAuth lifecycle behavior stays unchanged.
- [x] Focused service-boundary tests cover these contracts without a real external server.

## Manual

The `asterism.manual` manifest field stays. The host owns the source collection, including bundled application guides, and exposes it through the SDK. Builtin's Manual resource reads sources at operation time.

- [x] Replace builtin's forwarded manual sources with the SDK capability.
- [x] Keep package-relative boundaries and source-qualified paths.

## Provider usage

- [x] Move usage querying and caching beside providers in the host; builtin keeps per-response consumption and toolbar display as usage.

## Completion

Implementation and the relevant resource-tool, MCP, architecture, and SDK documentation are complete. Typechecks, production build, translation checks, and the final suite of 153 files / 927 tests pass. Isolated ordinary builtin loading and replacement-plugin session creation pass.

Settings and terminal interaction remain subject to manual user acceptance. No GUI, real terminal process, external MCP server, or installed application was launched for this acceptance. Real credentials and application data were not modified.
