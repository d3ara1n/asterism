# Model configuration

The host owns provider connections and callable model records. Paradigm plugins own reusable selections and execution configuration. Builtin implements model roles and Agent configurations in its own settings. Exact schemas and defaults belong to their owning source.

## Connections and presets

A connection owns its protocol, endpoint, credentials reference, model list, and compatibility settings. A model’s service ID remains distinct from its display name. The same service ID can exist under different connections.

A preset is a one-time template for connection values and editing rules. Saving creates an ordinary connection, without a persistent preset identity or brand-dependent execution branch. Later catalog changes do not rewrite saved connections.

Plugins supply presets. Payment products and regions can require separate entries even for one brand. A subscription description does not establish client admission or authorize impersonating another client.

Fixed fields constrain connection editing without changing credential replacement or request semantics. Custom connections accept explicitly supplied endpoint and compatibility choices.

Model connections share one field declaration and the same input controls and credential rules as other provider families. Presets supply initial values and fixed fields. Required text must be entered, and choices must belong to their declaration. Protocol, endpoint, identity, and compatibility constraints remain owned by the model connection schema.

A connection's API key is an ordinary saved value, edited and saved with the rest of the connection. API-key authentication requires a nonempty key; values are trimmed. Authentication methods without a key store none, so switching to unauthenticated access removes the saved key. Forms and save commands use shared validation rules. List status presents actual operations and access failures; connection tests belong to individual models.

Credentials are stored in plaintext where they are used: model keys in their connection, Web and messaging secrets in their settings, and MCP environment variables and headers in their server configuration, all in the global configuration document written with owner-only file permissions. Settings snapshots and editors carry the saved values; secret inputs mask them. Runtime projections of model connections omit the key, and consumers read the resolved credential separately. Existing deletions are preserved; invalid configuration is not silently replaced with defaults.

User-entered credentials beginning with `!` are shell commands; plugin secrets are returned as stored. A command runs through the platform shell on first use, with the application's inherited login environment and the user's home directory as its working directory. Successful nonempty standard output, trimmed at its boundaries, becomes the credential and stays in memory for the application's lifetime; it is never persisted. Concurrent readers of the same expression share one execution. Failures are not retained, so the next read runs the command again, and their errors omit the command and its output. A command stops when every waiting reader cancels or the application shuts down.

### Preset names and distinguishing information

A preset name is the provider or product brand, not a label assembled from its protocol, region, or billing method. Those distinctions remain separate from the brand. The editable name of a connection created from a preset is a different value: its initial suggestion can include distinguishing information, and later catalog edits leave saved names unchanged.

The picker uses supplementary labels to distinguish alternatives, not to inventory connection attributes. Billing headings already separate payment methods. Region labels such as Mainland China and International expose endpoint variants that the shared brand name cannot distinguish. A protocol with no alternative adds no useful distinction and remains absent from the subtitle.

Protocol labels appear only when entries share the same brand, billing group, region, and plan but offer different protocols. Command Code currently has that choice; its brand stays Command Code, while its subtitle identifies OpenAI Responses or Anthropic Messages. This is a comparison of catalog entries, not a special rendering rule keyed to that brand. The comparison uses the complete catalog so filtering search results does not change the meaning of an option.

## Model discovery and parameter lookup

Discovery seeks the provider’s model-list endpoint using the saved base address and connection authentication. It preserves the configured base path and tries two candidate request addresses in parallel by appending `/models` and `/v1/models`. The first candidate to return a complete valid catalog supplies the result; the other request is cancelled, and catalogs are not merged. Discovery does not change the configured inference address.

List parsing follows recognized response structure rather than provider branding. Unknown or ambiguous containers and malformed recognized metadata fail. An empty recognized list is valid.

All pages must succeed before delivering the deduplicated list. Adding models is atomic and does not overwrite existing entries. Only explicitly returned, supported metadata is imported.

Parameter lookup from models.dev returns supported capabilities and prices for the model ID entered in the editor. It matches normalized terminal model IDs exactly, with ambiguity treated as failure. The original full service ID remains the request identity.

Valid mapped fields overwrite the current draft values, using the same change detection and explicit save as manual editing. Lookup works before the model is saved and does not persist configuration or invalidate connection tests. Missing or unrepresentable metadata retains draft values with a diagnostic. Lookup does not infer compatibility packs from model names.

Input files are sent with their media types; the service determines accepted modalities and input limits. The client’s model capability switches govern reasoning and tool declaration.

Client validation protects request structure, resource authorization, and application-owned identity and history invariants. Configured generation values reach the service unchanged by provider-range assumptions or SDK model-name heuristics. A caller’s explicit output cap still combines with the configured cap under the public request contract; service acceptance and errors remain upstream responsibilities.

## Model targets and inheritance

A model expression identifies a provider and service model, split at the first slash. Thinking is an independent selection, though historical display expressions may append a standard level.

The SDK model target names a concrete provider, service model, and optional thinking level. The host resolves that exact pair and does not interpret roles. Missing or disabled models and unavailable credentials fail explicitly.

Builtin resolves its roles and optional Agent overrides before calling the host. A missing override inherits the role. A nonempty invalid reference fails instead of falling back.

Roles are reusable selections, not workbench objects. Model roles have an enabled state but no separate discovery-visibility policy. Disabled roles do not resolve. The utility role does not fall back to the current conversation.

Agent configurations combine optional role instructions, a default model role, resource access policy, assistant availability, and subagent settings. Empty role instructions produce no Agent role prompt block. Workbench Agents consume the shared instructions. Subagents also consume role-specific additional instructions appended to the shared prompt. Delegated-task behavior and report requirements belong to these configurable instructions.

Subagent settings group those additional instructions with a budget bounding request count and duration for one delegated run. Workbench Agents have no request or time limit. Additional instructions and individual budget fields inherit independently. Agent discovery exposes purpose and task examples; the chosen agent consumes its own detailed instructions. Resource links supply access to resource capabilities.

Resource access policy applies to both workbench Agents and subagents by resource type. Unrestricted mode allows all linked types, an allowlist permits only listed types, and a denylist blocks listed types. The two lists form one mutually exclusive policy; overriding either replaces the inherited policy. An empty allowlist denies every type, while an empty denylist denies none. Policy limits resource tool calls while leaving creation, listing, inspection data, and linked context available. Resource listings and inspections, as well as creation catalogs and entry inspections, annotate restricted types with a tool-call notice using the captured request policy; they do not hide or reject those types.

An Agent-level delegation allowlist applies to outgoing delegation in both workbench and subagent execution. Null permits any role enabled for assistant use, an empty list permits none, and a nonempty list names permitted target roles. The list replaces its inherited value as a whole. Agent discovery exposes each role available to assistants with its own allowlist, independently of the caller. Assistant availability controls discovery and admission of new model-created workbench Agents and delegated tasks. Missing, disabled, and nonpublic target configurations share the same model-facing selection error. Availability is not rechecked while executing an already selected Agent or accepted task; existing participants and retained reports remain visible through their normal resource relationships. It does not restrict user-selected conversations or outgoing delegation. Resource access policy and target role availability remain separate requirements.

Effective configuration combines all code-owned built-in entries, saved field overrides, and user-added entries. Built-in membership does not depend on the saved roster; newly introduced built-ins appear without rewriting user settings. Saved entries sharing a built-in identity supply overrides, not ownership. Custom roles inherit the original default role; custom Agents inherit unset fields from the factory `general` definition, regardless of the selected conversation default. Other built-in Agents, including `worker`, retain their own defaults. Adding a built-in changes the effective catalog without adding stored entries, changing the chosen default, or creating overrides. Editing another effective record does not change this inheritance baseline.

False values, empty lists, null inheritance, and cleared overrides retain their distinct semantics. Built-in entries can be disabled or restored but cannot be deleted or renamed. Custom-entry deletion does not cascade across saved references; the next resolution reports missing dependencies.

## Thinking controls

The standard levels are independent values, including explicit off. An unset level omits the upstream parameter after inheritance; off explicitly disables thinking where the protocol supports it.

The configured level set controls menus. It does not clamp or reject a saved explicit selection during request encoding. The service decides whether that value is accepted.

Disabling reasoning omits request reasoning options and historical reasoning parts while retaining saved selections and historical records. Returned reasoning is still received and displayed.

Protocol defaults map levels to effort or manual budgets. Messages uses adaptive thinking for explicit active levels regardless of the service model ID. The custom thinking budgets pack selects manual thinking instead; an empty pack uses built-in budgets. Effort mappings remain independent of that mode choice. Unset levels, disabled reasoning, and connectivity probes do not activate either mode. Explicit off sends disabled thinking even when a service rejects it.

Asterism owns Messages thinking mode and effort encoding at the final transport boundary. The SDK receives no explicit reasoning option for this protocol, so its model-name heuristics cannot replace the chosen mode. Compatibility settings do not trigger fallback requests.

Default manual thinking budgets are calculated from the effective total output cap. The cap includes thinking rather than receiving an additional hidden allowance. Explicit budgets are sent unchanged; the service determines whether a budget is accepted with that output cap.

Conversation, naming, and compaction share encoding; minimal connectivity tests have their own request purpose.

## Compatibility settings

Compatibility packs are a finite set of declared protocol adaptations. They do not expose arbitrary request patches.

Provider and model lists merge by pack ID. A model entry replaces the whole provider entry, without deep inheritance or an implicit tombstone. Applicability hints assist selection but do not automatically enable behavior.

Packs can adapt protocol placement, supported file transport, reasoning encoding, or request identity.

Messages prompt caching is an explicit pack, not a default of the protocol. The official Anthropic preset includes it for new connections. It requests automatic caching with the service default lifetime and leaves connectivity probes unchanged. Compatible endpoints that cache implicitly do not need this pack.

## Account usage

Account balance and quota are separate from response token usage and reference cost. A connection explicitly selects a usage provider.

Active providers query using supplied connection credentials. Header providers interpret response metadata supplied by the consumer. The provider catalog exposes those implementations. A separate host usage service obtains the selected connection's credentials, shares active queries, and caches results for consumers. Before retrieving credentials for an active query, it applies the same API-key HTTPS-or-loopback transport rule as model execution. Rejection is a configuration error, not a network or unsupported-operation error; header-only reads remain passive.

Usage items distinguish amount balance from quota windows and rate-limit headroom. Unknown limits and reset times remain unknown. An empty successful list is different from failure.

The host usage service shares state by connection. Query results and failures follow completion order; configuration changes invalidate the relevant state. Builtin explicitly supplies its received response headers and presents the shared state in its toolbar. Header refresh reads cached observations without making an artificial model request.

Every consumer presents availability with the same levels. Exhausted, shown in red, means no request can succeed: any window at zero or any balance at or below zero. Low, shown in amber, marks a window under a quarter remaining or a balance under ten. The balance threshold compares the bare number regardless of unit, because how fast work drains a balance shows in its magnitude. Query failure is a separate mark, and an item list that has not yet reported stays neutral. Consumers read the shared cache independently; a read finding a fresh result reuses it, so a refresh by one consumer serves the others without coordination.

The usage service preserves a previous successful result when refresh fails and labels it accordingly. A predicted reset time does not manufacture new quota. Precise refresh intervals and query paths belong to the service and provider implementations.

## Reference pricing

Price configuration estimates API cost using current prices. It is not a provider bill, account balance, or historical price ledger.

Rates distinguish modality, charge category, unit, and quantity basis. Missing prices are unknown; zero prices mean free. Token, image, and time units are not interchangeable.

Input-length tiers select the highest applicable threshold using one request’s total input, including cache. The selected tier prices the whole request; it is not progressive billing. Missing tier rates do not inherit the base tier.

Estimate each request using its actual recorded model identity before aggregation. Deleted or ambiguous models leave price unknown. Changing current prices changes historical estimates.

Reported input already includes cache reads and writes. Reported output includes reasoning. Split only where the required quantities and prices establish a valid partition. Missing subcounts do not become zero, and inconsistent totals invalidate the split.

If input modality or its quantity is unknown, do not price it as text by assumption. Distinguish complete estimates, known partial amounts, and unknown costs. UI rounding does not change saved usage or price data.
