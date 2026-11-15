# Choose models and shape Agents

Model choice and Agent responsibility answer different questions. The model supplies the reasoning and generation capabilities used for a request. The Agent's instructions define the work entrusted to it, the standards it should apply, and the decisions it should bring back to you.

Asterism shares model connections across the application. The builtin paradigm adds reusable model roles and Agent configurations. Other paradigms can organize their model choices differently.

## Choose for the work, not just the model name

Consider the task's demands: reasoning depth, input material, tool use, response time, and cost. A stronger model can be worthwhile for ambiguous decisions; a simpler task may not justify the same expense. A larger context can hold more material, but it does not resolve conflicting instructions or make irrelevant material useful.

Treat discovery and parameter lookup as starting information. The service you actually use determines model availability, supported capabilities, and billing. A familiar model name on a relay is not enough to establish that it behaves or costs the same as another connection.

Check a connection before relying on it for substantial work. A successful test establishes that the tested request worked; it does not validate every input or capability a later task may need.

## Reuse a model choice without confusing it with a role

A model role is a reusable model choice. An assistant role describes responsibility and expertise. Keeping them distinct lets you change the model without rewriting the working agreement, or use the same model for different responsibilities.

Use reusable choices for work you repeat. Make a task-specific choice when the material or stakes differ. Configuration changes are captured at request boundaries, so do not expect an in-progress response to adopt a new selection halfway through.

Response usage and estimated cost concern model requests; account balance and quota concern the provider account or plan. Use each to answer its own question rather than treating one as confirmation of the other.

## Put lasting responsibility in Agent instructions

An Agent configuration can leave its role instructions empty. The factory conversation default does so: it adds no role prompt or identity to the model context. Shared environment instructions, selected skills, and linked resource context still apply. Add role instructions when you want expertise, standards, and responsibilities that should survive individual tasks. Put the current goal, permitted scope, acceptance criteria, and reserved decisions in the task. This avoids turning a reusable role into a collection of stale project instructions.

For example, a reviewer role can define how to assess evidence and report findings. The task can identify which change to review and which risks matter this time. The role name alone does not make the review independent or give the reviewer access to the result.

Delegated tasks benefit from a clear deliverable and reporting agreement. Continuing workbench conversations are useful when a participant needs ongoing clarification or a lasting relationship with the user. Choose separate contexts because the work needs separation, not merely because roles have different names.

Built-in configurations remain part of the application. Your changes override their defaults, so new built-in configurations can appear after an update without replacing your choices or custom configurations. Disable a built-in configuration when you do not want to use it; deletion is available for custom configurations only.

## Separate instructions, access, and delegation

Instructions describe what an Agent should do. Resource links supply the objects it can use. Resource policies constrain calls through Asterism's resource dispatcher, while delegation policies constrain which roles it can assign tasks to. These are distinct choices: selecting a role does not supply its target resources or establish a reporting route.

Assistant availability is separate from enabling a configuration and from its outgoing delegation policy. A user-only configuration remains selectable for your conversations, but assistants cannot discover it as a creation or delegation target. Allowing assistant use does not require it to delegate further; its own delegation policy governs that separate choice. Closing a configuration to assistants prevents new model selections; it does not revoke an existing conversation or an accepted delegated task, hide participants you already connected, or remove earlier reports and history.

Neither a narrow role nor a resource policy turns local execution into a sandbox. Permitted shells, plugins, and external processes can act with the operating-system user's capabilities. Consider the real effects of the resources you provide, not only the intended specialization of the Agent.

Receiving a report also does not grant direct access to the reported material. If a reviewer must independently verify an output, give it the relevant resources and say what evidence the review requires.
