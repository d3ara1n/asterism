# Design and deliver a plugin

Start with one useful path from a user's intent to a domain result. Decide who owns the state, what changes it, and how the result becomes visible. Add more surfaces only when that path needs them. A plugin owns installation, identity, and lifetime; features can share that ownership without sharing every implementation detail.

## Choose what to integrate with

Extend an existing domain through its public contracts when that domain should still own the work. Own a resource when the capability has its own identity and lifetime. Own a paradigm only when you need to decide how work starts, how requests are assembled, and how execution is presented. A session does not require an Agent.

Keep shared declarations separate from backend work and frontend presentation. Organize each capability so its state transitions remain understandable together. Publish contracts when other plugins need their meaning, not to expose the provider's internal structure. Import the original declarations: a copy can match their types without sharing their runtime identity.

## Resolve interfaces from the target release

Use the Manual's SDK counter and built-in Agent examples to inspect a small plugin before writing one. Read them to see how responsibilities fit together; there is no need to run or install them to learn from them.

For implementation, start at the target release's public SDK or domain package exports, follow the types to their declarations, and trace a similar shipped capability and its tests in the application source. Check which parts are public before reusing them. Use the builder's source and CLI help for build configuration.

Develop against the packages for the application release you intend to support. The application and enabled providers supply shared packages at runtime; adding a development dependency does not install or upgrade the provider. Treat host-supplied packages as peer dependencies and keep ordinary private libraries with the plugin.

## Validate what users will load

The application loads a completed artifact, even when using a local checkout. Build separately, restart to activate it, and test the package outside the development workspace so dependency hoisting cannot hide missing declarations. Rebuild and restart after changing source; replacing files under a running graph can break a later lazy load.

Follow one action from its initiating surface to the committed result and back to the user. Check rejection, cancellation, reopening saved work, and cleanup with the owner gone. Type checking tests agreement with declarations; loading the delivered artifact tests the provider, dependencies, and files users actually receive. Use both.

## Find the next design decision

| If you need to decide… | Read |
| --- | --- |
| What an Agent can discover, call, and learn from an operation | [Resources and tools](resources-and-tools.md) |
| What to persist, migrate, or release | [Data and lifecycle](data-and-lifecycle.md) |
| How a workflow starts or receives external events | [Session entries](session-entries.md), [messaging](messaging.md) |
| What a view owns and how it fits the workbench | [Views and settings](views-and-settings.md), [visual language](visual-language.md) |
| What belongs in a plugin's own manual | [Plugin documentation](manual.md) |
