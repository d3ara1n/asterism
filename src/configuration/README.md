# Application configuration

Global configuration is independent of session history. The host owns model and web provider connections, model definitions, shell profiles, MCP servers, and the selected Home entry. Roles, Agent configurations, and paradigm-specific behavior belong to the owning plugin.

Separate saved configuration, credential references, and runtime service views. Provider service views expose configured connections and registered usage implementations; plugin adapters bind access and subscriptions to the consumer's lifetime.

Network discovery and parameter lookup are explicit operations. They report unknown or ambiguous information instead of guessing from a name.

Provider registration, protocol adaptation, credential storage, and usage display are separate responsibilities. A service catalog does not imply one mandatory consumer or cache policy.

## State and feedback boundaries

Saved settings, transient connection checks, and model discovery results have separate owners. The configuration service coordinates commands and assembles the settings snapshot; runtime consumers read domain-specific views rather than depending on unrelated settings or task results. Shell and MCP settings pages project their own values from the shared renderer transport. These boundaries do not require separate files or IPC protocols.

Each settings entry owns its pending state and failure feedback. Successful receipts update saved values; failed saves retain the current values and remain visible through inline feedback or a toast at the initiating entry. A successful operation without a return value is still distinguishable from failure. Read failures have a separate status and retry path instead of being reported as save failures. Appearance can render default tokens during startup while its settings page waits for a successful read.
