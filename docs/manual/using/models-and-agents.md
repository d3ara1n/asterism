# Configure models and agents

Model connections, model roles, and agent configurations serve different purposes. Select the connection and model first, then reuse that selection through roles or agent defaults.

Provider connections and models belong to the application. Roles and Agent configurations belong to the builtin paradigm and have their own contributor-labeled settings pages. Another paradigm can organize its model choices differently while using the same configured providers.

| Item | Purpose |
| --- | --- |
| Provider connection | Service endpoint, protocol, credentials, and its model list |
| Model | A service model ID and its capabilities and generation parameters |
| Model role | A reusable model selection and thinking level |
| Agent configuration | Instructions, a default model role, and execution budgets |
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

## Configure an agent

Use an agent configuration to describe its purpose, instructions, model role, and execution budgets. Create separate workbench agents when independent conversations or collaboration help the task. The subagent time budget applies to tasks in a Subagent Pool; an unset subagent request limit leaves time as the bound.

Resource links determine which objects an agent can use. Tool implementations supply the operations supported by those objects. Selecting an agent configuration does not supply target resources.

## Interpret usage

Response token usage and estimated cost describe model requests. Account balance and quota describe a provider account or plan. They may update through different mechanisms and need not agree with an estimated response cost.

For errors, inspect the provider’s actual response before changing settings.
