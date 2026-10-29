# Application configuration

Global configuration is independent of session history. The host owns model and web provider connections, model definitions, shell profiles, MCP servers, and the selected Home entry. Roles, Agent configurations, and paradigm-specific behavior belong to the owning plugin.

Separate saved configuration, credential references, and runtime service views. Provider service views expose configured connections and registered usage implementations; plugin adapters bind access and subscriptions to the consumer's lifetime.

Network discovery and parameter lookup are explicit operations. They report unknown or ambiguous information instead of guessing from a name.

Provider registration, protocol adaptation, credential storage, and usage display are separate responsibilities. A service catalog does not imply one mandatory consumer or cache policy.
