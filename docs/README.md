# Documentation directories

Choose material by the question it answers. The Manual resource exposes guides and examples from the application, public packages, and loaded plugins. Use guides to understand a decision and examples to see a prototype; use the target SDK to resolve interfaces.

| Question | Where to look |
| --- | --- |
| How should work be organized in Asterism? | [Application manual](manual/README.md) |
| How should a plugin fit the host or a built-in domain? | [SDK guide](../packages/sdk/docs/getting-started.md), [built-in Agent guide](../packages/builtin-api/docs/agents.md), [artifact guide](../packages/plugin-build/docs/building-plugins.md) |
| What does a small plugin look like? | [SDK counter example](../packages/sdk/examples/counter/README.md), [built-in Agent examples](../packages/builtin-api/examples/README.md) |
| Which interface actually implements a capability? | The target release's public exports, application source, and tests |
| What should an internal change preserve? | [Engineering documentation](development/README.md) |
| What is under investigation or explicitly deferred? | `plans/`; closed work is in `plans/archived/` |
