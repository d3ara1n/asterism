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

## Store credentials or read them from a password manager

Credential fields accept a literal API key or a shell command prefixed with `!`, such as:

```text
!rbw get openai-api-key
```

Literal credentials and command expressions are saved in plaintext in the application's local configuration, with owner-only file permissions. Settings show the saved value or command in a masked field; clearing the field removes it.

A command runs the first time its credential is needed, using the platform shell, the application's login environment, and the user's home directory. A successful command must print the credential to standard output; leading and trailing whitespace is removed. Saving or viewing provider settings does not execute it. A failed command or empty output produces a credential error, and the next use runs the command again, for example after unlocking the password manager.

Successful output stays in memory until the application restarts and is shared by every connection using the same command; restart the application to read a rotated value. MCP environment and header fields also accept `!` commands. Resolved output is not written to configuration.

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

Agent Markdown supports standard footnotes with return links and external web links. Footnotes spanning separate paragraphs become available after the response finishes rendering.

## Reference resources and skills

A reference is a Markdown link whose destination is a reference URL. Two schemes exist:

- `[label](resource:<resource ID>/<location>)` names a location inside a resource, for example `[guide](resource:manual-id/sdk/docs/getting-started.md)`. The resource ID comes from the session's resource listing. The resource interprets the location; directory and manual locations are relative file paths. Each location segment is percent-encoded, with `/` separating segments.
- `[label](skill:<name>)` or `[label](skill:<name>/<package path>)` names a skill or a file inside its package. `skill_read` reads it by name and path.

References are ordinary text in both user and Agent messages. A reference URL grants no access and may name something absent: a resource that was removed or is not linked to the Agent remains a valid string. In rendered messages, a resource reference opens the resource through its own interface, independently of the Agent's tool access, and a removed resource shows a missing-resource notice. A skill reference appears as a violet chip and opens nothing.

In the composer, references appear as chips: violet for skills, blue for resource locations. Typing `@` opens a reference menu. Its first level lists categories; typing searches all categories, and name matches rank before description matches. Arrow keys move the selection, Enter or Tab chooses, and ArrowLeft or Backspace on an empty query returns from a category. Plugin views can also offer references by dragging; dropping them in the composer inserts the chips at the drop point. A sent message contains the same Markdown links, and typing a link by hand has the same effect.

## Interpret usage

Response token usage and estimated cost describe model requests. Account balance and quota describe a provider account or plan. They may update through different mechanisms and need not agree with an estimated response cost.

For errors, inspect the provider’s actual response before changing settings.
