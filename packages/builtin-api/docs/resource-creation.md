# Offer resource creation to Agents

A plugin can make its resource available through builtin's model-facing creation mechanism without adopting the Agent's lifecycle or giving up ownership of the resource. The resource plugin still defines what the object means, what state it owns, and how it behaves.

## Reuse creation meaning

Build on the original public creation contract rather than creating a parallel initialization path. A straightforward entry can expose that contract directly. A specialized entry is useful when a model can supply a smaller meaningful input, such as a short note from which the plugin derives a titled document.

Keep that adaptation explainable. It should translate intent into the same domain creation operation, not bypass validation or hide unrelated effects. Descriptions and schemas should make the resulting object's purpose understandable without a manual recipe.

## Choose relationships explicitly

Creation and access are separate responsibilities. A new resource does not inherit every link or capability of its creator. Decide which initial relationships make it useful within the invoking request's authorized scope.

The Agent's access to the new object and the object's access to the Agent are independent. A document may need only to be readable; a communication resource may also need a route back to its creator. Choose the reverse relationship for that purpose rather than treating mutual visibility as an automatic consequence of creation.
