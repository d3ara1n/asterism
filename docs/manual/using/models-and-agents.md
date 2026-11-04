# Configure models and agents

Model connections, model roles, and agent configurations serve different purposes. Select the connection and model first, then reuse that selection through roles or agent defaults.

Provider connections and models belong to the application. Roles and Agent configurations belong to the builtin paradigm and have their own contributor-labeled settings pages. Another paradigm can organize its model choices differently while using the same configured providers.

| Item | Purpose |
| --- | --- |
| Provider connection | Service endpoint, protocol, credentials, and its model list |
| Model | A service model ID and its capabilities and generation parameters |
| Model role | A reusable model selection and thinking level |
| Agent configuration | Shared role instructions, a default model role, and subagent settings |
| Workbench agent | A session object using an agent configuration and optional overrides |

## Add and check a connection

Choose a preset for a supported service or create a custom connection from that service’s API requirements. Presets may fix protocol and compatibility settings. A custom connection lets you supply those settings explicitly.

Model discovery retrieves available model IDs. Parameter lookup supplies reference capabilities and pricing. Check both against the service you actually use: a matching name alone does not establish identical capabilities or billing.

In the model editor, enter a service model ID and fetch parameters to fill the form, including for a new, unsaved model. Returned fields replace the values currently entered; unavailable fields keep their values. Review or edit the result, then save. The save action becomes available when the draft differs from the saved model.

Changing a preset catalog does not rewrite connections already saved from it.

## Choose a model for work

Use the conversation’s model selector for a specific task. Model roles supply reusable defaults and support features that need a model outside the conversation.

Thinking levels depend on the selected model. Asterism translates its shared levels into the protocol’s supported settings. Configure the model’s capabilities accurately so that the selector and requests agree.

Configuration changes apply at request boundaries. An in-progress response continues with the connection, credentials, and settings it captured.

Agents retry upstream model failures up to three times before stopping. The live status shows retry progress, and Stop also cancels a retry wait. Each new attempt uses the current configuration and usable conversation history. Errors reported as authentication or insufficient balance can also be retried because relay services do not always classify failures accurately.

Interrupted content remains inspectable. A dashed outline means the content does not fully participate in later model context; an error outline marks content left unfinished by a failed request. A tool that ran and failed shows that in its own status rather than an error outline. Complete usable content can remain in context even when the same response later fails. Request errors appear in notices, while tool inputs retain their original preview. A historical tool input without a result does not resume execution automatically.

## Configure an agent

Use an agent configuration to describe its purpose, shared role instructions, and model role. The role prompt applies both to workbench agents and to subagents. Keep the role's expertise and standards there.

Subagent settings contain additional instructions and an execution budget. Use the additional instructions for delegated-task responsibilities and report requirements; they append to the shared role prompt. The budget limits requests and duration for one task in a Subagent Pool and does not affect workbench agents. Clearing a prompt or budget override restores its default. Create separate workbench agents when independent conversations or collaboration help the task.

Resource links determine which objects an agent can use. Tool implementations supply the operations supported by those objects. Selecting an agent configuration does not supply target resources.

Resource access settings apply to both workbench agents and subagents. Choose unrestricted access, an allowlist of resource types, or a denylist of resource types. An empty allowlist blocks every type; an empty denylist blocks none. All built-in Agent roles default to unrestricted resource access.

Restricted resources still appear in listings and retain their inspection information. Inspection adds a notice naming the denied Agent role; a tool call on that resource is rejected for that role. Changing the role or its policy applies on the next request. Resource policies control calls through Asterism's resource dispatcher, not network or filesystem operations performed through other permitted resources.

Delegation settings control which roles an Agent can delegate tasks to, whether it runs on the workbench or as a subagent. Each role supplies a default allowlist that can be customized or set to unrestricted. An allowlist permits only selected roles; an empty allowlist disables delegation. The target must also be enabled. This setting controls outgoing delegation, independently of resource access or whether the role can receive a task.

`agent_list` exposes each role's own `delegates` value alongside its purpose and examples: `null` means unrestricted, `[]` means none, and an array names allowed target roles. Delegation calls enforce the calling role's policy and identify both roles when rejecting a disallowed target.

## Receive messages

Workbench Agents accept user messages, messages from other Agents, and event messages submitted by resource plugins. They share the same conversation and input queue. Incoming Agent messages identify the Agent; event messages have an event icon, blue background, and the source resource's name. The content is ordinary text and attachments.

Accepted input starts an idle Agent. While it is running, inputs can join the next model request or wait for the next turn according to their delivery mode. Drafts show pending messages and their timing. Taking an incoming message into the composer makes its next submission a user message.

A resource integration must implement notification delivery to send event messages. Linking a resource alone does not create that integration. The Agent's instructions define how it handles received facts, and its available resources supply the operations it can perform. Application startup restores saved drafts without sending them automatically.

Agent Markdown supports standard footnotes with return links, external web links, and resource locations. Footnotes spanning separate paragraphs become available after the response finishes rendering. Write a resource link as `[label](resource:<resource ID>?location=<percent-encoded location>)`; for example, `[guide](resource:manual-id?location=sdk%2Fdocs%2Fgetting-started.md)`. The resource ID comes from the session's resource listing, and the target resource interprets the location. Directory and manual locations are their relative file paths. Clicking opens the resource using its own interface, independently of the Agent's tool access. Removed resources show a missing-resource notice.

## Interpret usage

Response token usage and estimated cost describe model requests. Account balance and quota describe a provider account or plan. They may update through different mechanisms and need not agree with an estimated response cost.

For errors, inspect the provider’s actual response before changing settings.
