# Host shared services

Filed on 2026-10-28. Decision and placement criterion: `plans/ref-2026-10-28-plugin-paradigm-layering.md`.

Each service follows the criterion's layers: host configuration and settings page, SDK domain model and capability, builtin usage. Define each SDK interface from builtin's current consumers; caches, process supervision, and reconnection stay internal.

## Terminal and shell

Host settings own shell profiles and the default selection. Terminal typography stays in appearance settings. The SDK exposes `plugin.terminalProfiles`, interactive terminal sessions, and one-shot command execution. Builtin's Terminal resource and directory exec become adapters.

- [ ] Move shell profile configuration out of `BuiltinSettings.shell` into host configuration and a host settings page.
- [ ] Move profile resolution, process start, and piped execution into an SDK capability with streamed output, cancellation, timeout, and settling.
- [ ] Move the PTY session, screen state, and shell-readiness integration into an SDK capability; builtin keeps the resource, card, tools, and model-facing text.
- [ ] Preserve current behavior: resource removal ends its shell and child processes; restart retains resource configuration; user and model input share one session; packaged native binaries are used.

## MCP

The host owns server configuration, credentials, connections, discovery cache, state, and calls, with the settings page. Builtin's MCP Host resource and tools adapt the service to resource links.

- [ ] Move configuration out of `BuiltinSettings.mcp` and credentials out of builtin secrets.
- [ ] Preserve current contracts: cancelling one call keeps the shared connection for others; a captured call keeps its server and tool identity across configuration edits; connection failure does not replay a call; OAuth lifecycle behavior stays unchanged.
- [ ] Focused service-boundary tests cover these contracts without a real external server.

## Manual

The `asterism.manual` manifest field stays. The host owns the source collection, including bundled application guides, and exposes it through the SDK. Builtin's Manual resource reads sources at operation time.

- [ ] Replace builtin's forwarded manual sources with the SDK capability.
- [ ] Keep package-relative boundaries and source-qualified paths.

## Provider usage

- [ ] Move usage querying and caching beside providers in the host; builtin keeps per-response consumption and toolbar display as usage.

## Completion

Update the terminal, MCP, and architecture engineering documents to the implemented behavior. Typechecks and focused tests pass; settings and terminal behavior are accepted by the user.
