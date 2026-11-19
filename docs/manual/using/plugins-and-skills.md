# Use plugins and skills

Plugins extend what Asterism can do. Skills describe methods an Agent can read and apply. Choose between them by asking whether the missing piece is an executable capability or a way of working.

## Choose capabilities deliberately

A plugin can introduce resources, operations, and views, or a different Agent experience. Installing a plugin is a trust decision: its code runs locally, and resource links are not an operating-system sandbox. Choose packages whose behavior and access to your environment you accept.

The bundled builtin plugin supplies the official conversational Agent experience. It is still a plugin, not the definition of every possible Asterism session. Another plugin can organize work differently while using the same resource-centered workbench.

Add capabilities for a concrete need. A new division of responsibilities between existing Agents does not necessarily need a new plugin. Conversely, instructions alone cannot create an integration or enforce execution dependencies that the available capabilities do not implement.

Removing a plugin is not the same as undoing its work. Historical records and external effects can outlive the implementation that created them. Before relying on plugin removal as cleanup, distinguish saved material from active services and from changes made outside Asterism.

## Separate selection from activation

Asterism loads completed plugin artifacts, not source projects. Adding or changing a selected package takes effect after restart. Until then, plugin management shows both what is running now and what the next startup will load: a removed plugin stays listed while it still runs, and undoing the removal before restarting restores its previous position and enablement. A successful download, build, or metadata inspection does not establish that the plugin's storage and contributions will initialize successfully.

For a local directory, choose the package root with its completed build. You own that directory, its dependencies, and any Git workflow. Build changes explicitly before restarting; source edits alone do not update the running plugin. Removing the registration does not delete your directory. Rebuilding replaces the plugin's output; a running application can then fail to load parts it had not loaded yet, until you restart it.

Bundled packages arrive with the application. Removing one from the selection does not remove the distribution's copy; adding it back still uses the restart boundary. The difference is source ownership, not execution format or lifecycle.

For npm-managed packages, the application owns the downloaded installation and records an exact version. Updating prepares another installation for the next restart; the running plugin keeps its current files. An installation failure leaves the previous selection intact, while an initialization failure after restart is reported rather than silently downgrading code or data. Restarting does not follow a registry tag or fetch missing packages.

Prebuilt JavaScript can still depend on native packages with installation scripts. Unreviewed dependency builds pause installation for an explicit decision. Those scripts run with the current user's permissions, not inside a plugin sandbox. Approval does not establish that a package supports the application's Electron runtime or the current operating system; missing tools and incompatible native binaries remain visible failures.

A data recovery point retains managed package selections and dependency lockfiles, not every downloaded package. If an installation is missing, explicitly reinstall its recorded version. Reacquisition can reuse retained dependency choices, but it still depends on the registry or local package store having those files. Uninstalling managed code retains plugin data, credentials, session objects, and history.

A plugin can depend on a public capability supplied by another enabled plugin. Installing an authoring API package or an ordinary npm dependency does not activate that provider. An unavailable provider can therefore make a consumer unavailable even when all its package files are present. This preserves shared contract identity instead of silently substituting a private copy.

## Use skills for selected methods

A skill is useful when you want to reuse a procedure, evaluation standard, or handoff convention. It can carry supporting material so the Agent can consult a method when relevant instead of burdening every task with its full instructions.

Choose methods that fit the task. You can ask for a particular skill explicitly, or let the Agent identify a relevant one from the available descriptions. Installing a skill makes a method available; it does not mean that every task should follow it.

A skill supplies neither missing resources nor executable capabilities. It also does not grant approval for actions you have reserved. If a method calls for publication or an external change, the working agreement and available resources still matter.

## Make reusable instructions worth reusing

Keep enduring expertise and responsibility in an Agent role. Use a skill for a method you may want across roles or only for particular tasks. Keep the current project's scope and acceptance criteria in its task or shared material.

When adapting a skill, preserve the purpose behind its steps rather than accumulating exceptions for unrelated tasks. A useful method explains the judgment it supports, what evidence matters, and when to stop or ask for a decision. Exact operation syntax belongs to the capability that implements the operation, not to a second catalog inside the skill.

For example, a review skill might ask the Agent to distinguish observations from assumptions and report unresolved decisions. It need not duplicate the file-reading operations available in the current workbench.
