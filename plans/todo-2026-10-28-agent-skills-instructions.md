# Agent skills, instructions, and request preparation

Filed on 2026-10-28. Decision: `plans/ref-2026-10-28-plugin-paradigm-layering.md`. Supersedes the archived plugin skill and plugin system-prompt tasks.

## Host collection

The host keeps a skill catalog of raw sources: the user skill directory and plugin-registered directories. It owns scanning, same-source duplicate diagnostics, refresh, and the skills settings page. Instruction contributions are fixed text blocks declared during plugin setup. Both record the contributing plugin from the actual plugin context and are removed with its lifetime.

- [ ] Add package asset access to `PluginContext`, separate from the plugin data directory, resolved against the contributing package root in installed and compiled layouts.
- [ ] Add SDK `defineAgentSkills` and `defineAgentInstructions`; each declaration can register several entries.
- [ ] Move skill scanning and management from builtin into the host service and its settings page.
- [ ] Declare builtin's environment and message-envelope text through `defineAgentInstructions`.

## Builtin request preparation

For each model request, builtin flattens the host collection into an effective skill list (user above plugin above builtin, deterministic order among plugins) and a block list. Every entry keeps its source. Ordered preparers edit these lists; builtin then projects them into instructions.

- [ ] Add `builtin-api` `defineAgentPreparer`. Preparers are synchronous pure functions over the lists and run in plugin load order. Initial operations: remove or filter skills, including removing all; remove, rewrite, or append blocks.
- [ ] Freeze the prepared result at request start. Instruction projection and `skill_read` for that request and its tool batch use the frozen list, so a removed skill is unreadable and a refresh affects only later requests.
- [ ] Provide one assembly entry used by submission admission, the loop, and compression estimates.
- [ ] Record skill content replacement and tool filtering as later extensions; they need supporting-file and authorization decisions.

## Validation

- [ ] Registration uses the actual contributor identity; failed setup leaves no entries.
- [ ] Override order, provenance in flattened lists, and preparer ordering produce the expected projection.
- [ ] A frozen request rejects reading a removed skill and keeps its package binding across a refresh.
- [ ] Package asset resolution stays separate from plugin data storage.
- [ ] Typechecks and focused unit tests pass; the skills settings page is accepted by the user.
