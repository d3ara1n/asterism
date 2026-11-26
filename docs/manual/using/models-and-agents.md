# Choose models and shape Agents

Model choice and Agent responsibility answer different questions. The model supplies the reasoning and generation capabilities used for a request. The Agent's instructions define the work entrusted to it, the standards it should apply, and the decisions it should bring back to you.

Configure shared language model connections under **Language model providers** in the **Providers** settings. The builtin paradigm adds reusable model roles and Agent configurations. Other paradigms can organize their model choices differently.

## Choose for the work, not just the model name

Consider the task's demands: reasoning depth, input material, tool use, response time, and cost. A stronger model can be worthwhile for ambiguous decisions; a simpler task may not justify the same expense. A larger context can hold more material, but it does not resolve conflicting instructions or make irrelevant material useful.

Treat discovery and parameter lookup as starting information. The service you actually use determines model availability, supported capabilities, and billing. A familiar model name on a relay is not enough to establish that it behaves or costs the same as another connection.

Check a connection before relying on it for substantial work. A successful test establishes that the tested request worked; it does not validate every input or capability a later task may need.

## Choose thinking behavior for the endpoint

Anthropic Messages connections use adaptive thinking when you select an active thinking level. This choice is independent of the model name, so a relay alias does not silently select a different thinking mode. A familiar Claude name does not establish which modes a relay accepts.

For an endpoint that needs token-budget thinking, add the Custom thinking budgets compatibility setting. Adding it selects manual thinking even with no per-level overrides; it is not just a tuning control for a mode selected elsewhere. The total output cap includes both thinking and the answer, so a larger thinking budget leaves less room for the answer. A request that the endpoint rejects remains a visible failure rather than being retried in another mode.

These choices apply to subsequent requests, not an already-running response. Adaptive thinking does not impose a wall-clock deadline, and switching modes is not evidence that a relay will complete a task.

## Configure models once through model roles

A model role is a named, reusable choice of model and thinking level. Open **Roles** in the builtin plugin settings and assign a model to each role you use. Changing a role changes the model for later requests that use it. You do not have to update each Agent that shares the role or choose a model again when you use a feature that already has a role.

An Agent role defines what the Agent does. Its **Default model role** determines which model and thinking level it normally uses. Agent conversations and delegated subagent tasks can share a model role even when their responsibilities differ. For example, exploration and research both use `fast` in builtin's supplied Agent roles. An explicit choice of model can still override the default for a particular conversation or delegated task.

Session title generation and Peek use builtin's `utility` role directly, not the Agent's default model role. Peek lets you ask questions about a conversation without adding them to it. If you use Peek, choose a `utility` model that supports tool calling. If `utility` is unavailable, title generation leaves the title unchanged rather than falling back to the conversation model.

Create a custom model role when you want a different reusable model choice for one or more Agent roles. Select it as the **Default model role** in **Agents** settings. Only Agent roles use custom model roles; to change the model for titles or Peek, edit `utility` itself.

## Read usage statistics as estimates over a permanent record

Response usage and estimated cost concern model requests; account balance and quota concern the provider account or plan. Use each to answer its own question rather than treating one as confirmation of the other.

Usage statistics collect every model request across sessions and plugins, so you can see where cost and tokens went by folder, session, model, purpose, and time. They record counts, timings, and outcomes, never conversation content. The record is kept until you delete it; archiving or deleting sessions and folders does not remove their usage, and restoring a recovery point does not rewind it.

Filters choose a model category, a model, a provider, or a combination. Providers and models belong to a category, so the same ID in another category is a separate choice and is labeled with its category in lists and details. A model names one model ID across the providers in its category that served it, so the same model reached through two relays reports one result; adding a provider narrows that to the relay. Measurements that belong to a connection, such as price, output speed, and first-output time, stay per provider in breakdowns and details, because a relay may price and serve the same model differently. Thinking levels, first-output time, and output speed describe language model generation and count language model requests only.

Costs are estimates computed from the prices configured for each model when the request finished. Changing a price later does not rewrite earlier estimates, and requests whose price was unknown or only partly known are counted as such rather than as free. A provider's bill can still differ: relays, discounts, and charges the protocol does not report fall outside the estimate. Use provider balances for what the account actually holds, and usage statistics to understand which work consumed it.

Folders and session names follow your current organization. Moving a session to another folder moves its history with it; names recorded at the time remain visible after a session or folder is deleted. A monthly budget sets the pace shown for the current calendar month; it does not limit requests.

The **Skills** view counts each successful read as one use. The total includes repeated reads of the same skill. Check the list of skills not read in the selected range before narrowing a large catalog. An absent record does not tell you what happened before tracking began. The catalog size describes the average number of characters in requests that included the list of skill names and descriptions. Three successful reads in one Agent turn count as three reads and one turn. Use the file and role breakdowns alongside both counts to distinguish repeated reads in one turn from use across different turns or Agents. Older reads can have unknown turn data. A successful read shows that the model loaded a file, not that its instructions shaped the result.

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
