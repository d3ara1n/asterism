# Built-in public API

This package lets plugins participate in the bundled Agent domain without importing its private implementation. The enabled provider supplies the original contracts and behavior at runtime; this package is not a second plugin.

Use the [Agent integration guide](docs/agents.md) to decide what belongs in an existing Agent. Read the bundled examples to see how an integration is assembled; use the target release's public source and types for the interface. Generic hosting capabilities live in the SDK.
