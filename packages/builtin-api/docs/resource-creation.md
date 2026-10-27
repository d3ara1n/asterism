# Offer resource creation to agents

A plugin can expose its resource's public creation contract through the built-in agent creation mechanism. The plugin still owns the resource type, initial data, projection, and lifetime. The built-in domain integration supplies the model-facing creation entry.

Declare creation once and pass that original contract to the integration. A straightforward entry accepts the creation contract's input directly. A specialized entry can define a smaller model-facing input and transform it into the same creation input, such as turning a short note into a titled document.

Creation participates in the host's resource and history operations. The created object links to the invoking agent. Optional initial resources remain within the request's captured resource scope. Explicit self-exposure supplies the reverse relationship; a new resource does not inherit every link or capability of its creator.

Use descriptions and schemas that explain what the resulting resource means and what inputs the model should supply. Creating another agent is also an explicit domain operation with its own configuration and initial links.
