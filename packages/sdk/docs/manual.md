# Publish useful plugin documentation

A plugin can expose documentation and source examples through Asterism's Manual resource. This makes authoring material available on demand while keeping the same files usable outside the application.

## Choose what to publish

Expose directories intended for users learning the software or authors developing an integration. Include that material in the distributed package. Internal fixtures, private working notes, and credentials have different audiences and belong outside the published material.

Keep documentation with the domain that owns its meaning. Generic hosting concepts belong to the SDK; a plugin's behavior and extension rationale belong to that plugin or its public API package. A separate public API library can own its authoring material without becoming another executable plugin.

## Explain decisions that declarations cannot

Use prose for mental models, responsibility boundaries, integration choices, and reasons to prefer one composition over another. Public types express concrete interfaces; maintained source examples demonstrate concrete assembly. Repeating either as a field list creates a second, weaker definition.

An example is worth discussing when the explanation helps an author adapt it. Explain why a service is shared, why a record is durable, or why a view does not own a task. Let the example's source carry its exact syntax.

Write each article with enough context to stand alone. Organize it around an author or user question, not a tour of every available method. A reading sequence should not be necessary to understand a capability's purpose.

## Keep runtime guidance with tools

Models consult the manual when helping with software use or plugin development. Ordinary tool use should not depend on reading it.

A tool's descriptions, guidelines, and schemas own its complete invocation contract: purpose, input meaning, result interpretation, and execution boundaries. When a runtime misunderstanding appears, improve that contract rather than adding a manual recipe. Documentation can explain how an author designs such a contract without becoming a second place to maintain it.
