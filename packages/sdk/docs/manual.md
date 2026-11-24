# Publish useful plugin documentation

Publish design and usage topics through the Manual resource so an Agent can find the reasoning it needs without loading the whole handbook. Include small source examples when reading the prototype makes an integration easier to grasp. Keep test fixtures with the code they exercise and leave exact interfaces to the public declarations.

Keep documentation with the domain that owns its meaning. Generic hosting concepts belong to the SDK; a plugin's behavior and extension rationale belong to that plugin or its public API package. A separate public API library can own its authoring material without becoming another executable plugin.

## Explain decisions that declarations cannot

Explain decisions an Agent cannot recover from declarations: why a service is shared, when a record should be durable, or why a view does not own a task. For exact interfaces and concrete assembly, direct development to the target SDK, application source, and tests.

Group independently readable articles by the reader's decisions. When a mechanism changes those decisions, revise their existing topic or remove outdated guidance rather than creating a page for the mechanism.

## Document shortcuts where they work

If your plugin provides keyboard shortcuts, publish a **Keyboard shortcuts** topic or section in its own manual. Group shortcuts by view or dialog. Say where focus must be, what the shortcut does, and which keys differ by platform. Include a command or button alternative when it helps users find the action.

The application manual covers shortcuts owned by the host. A plugin topic covers the plugin’s shortcuts, including any context that determines when they are available. Include it in the shipped manual.

## Keep runtime guidance with tools

Models consult the manual when helping with software use or plugin development. Ordinary tool use should not depend on reading it.

A tool's descriptions, guidelines, and schemas own its complete invocation contract: purpose, input meaning, result interpretation, and execution boundaries. When a runtime misunderstanding appears, improve that contract rather than adding a manual recipe. Documentation can explain how an author designs such a contract without becoming a second place to maintain it.
