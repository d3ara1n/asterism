# Product purpose and boundaries

Asterism is a local-first personal agent workbench. People organize a piece of work, supply material, observe execution, and continue from its results or history.

The product name is Asterism, with `asterism` used in code. The name describes a recognizable arrangement of stars: objects and relationships become meaningful through how a person organizes them.

## Organize work around objects

A session contains a piece of ongoing work. Agents, materials, and capabilities appear as cards and links. Tool details expand when useful, rather than turning every message and call into a permanent canvas object.

The workbench supports research, file maintenance, programming, and other personal tasks. A single agent must offer a complete experience; agent count is not a product success metric.

Software-use and plugin-development guidance is maintained as English Markdown inside the project. Models read relevant topics on demand and explain them in conversation. A separate public documentation site and localized manual editions are outside this model.

## Preserve history without claiming recovery

Asterism owns the history of work independently of any provider or agent framework. Browsing history leaves current reality unchanged. Continuing from another position changes the active path and reconstructs recorded object relationships.

Resource state restoration is a separate capability. External directories do not promise filesystem rollback or isolated branches. Current note data is not a versioned resource history.

Directory resources validate interaction with external mutable data. Resources that explicitly record their state can validate reconstruction and restoration. Current resource examples do not define a final catalog.

## Keep the product boundary explicit

The application starts as single-user local software. Resource access is a context boundary enforced by the runtime; links and UI visibility are not an operating system security boundary.

Multiplayer collaboration, a plugin marketplace service, cloud synchronization, a general shell sandbox, and automatic rollback of arbitrary system effects are outside the initial product scope.

## Judge the experience

A useful workbench makes these facts understandable:

- Which work is running, waiting for input, complete, or interrupted.
- Which objects an agent can use and which operation affected an object.
- How views relate to persistent objects and background execution.
- How to continue from history while inspecting current external state.
- How earlier operations remain inspectable after links or plugins change.

Using the software should not require continuous manual canvas arrangement.
