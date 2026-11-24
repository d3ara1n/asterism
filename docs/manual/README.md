# Asterism manual

This manual explains how to think about work in Asterism. It is for people using the workbench and authors deciding how their plugins should fit into it. Models consult relevant topics when helping with those tasks.

For users, the emphasis is on organizing work, choosing responsibilities, sharing material, and understanding the difference between recorded work and its effects. For plugin authors, it is on ownership, integration choices, and the reasons behind the public extension model.

Each topic stands on its own. Begin with the question or decision you are trying to resolve rather than following a required reading sequence. An assistant can explain a relevant topic in your language and relate it to your work.

## Find a topic

| Area | Purpose |
| --- | --- |
| Root topics | Workbench concepts and Agent paradigms |
| `using/` | Getting started, session lifecycle, configuration, workflows, and diagnosis |
| `using/resources/` | Related resource types grouped by their role in the work, with relationships, behavior, and caveats |
| SDK guides | Plugin boundaries, tool calls, saved data, and presentation |
| Built-in public API guides | Integration with an existing Agent and model-facing resource creation |
| Plugin examples | Source prototypes to read for SDK-only plugins and built-in Agent integrations |
| Artifact guide | Delivery and runtime dependency choices |

Resource topics explain what helps users choose an arrangement or understand an observed result. The available creation entries and inspected tool contracts supply operational details rather than requiring the manual as an invocation reference.

For plugin implementation, follow the target release's public SDK or domain exports to their declarations, then inspect the corresponding application source and tests. The manual pairs design guidance with readable prototypes, not an API inventory.
