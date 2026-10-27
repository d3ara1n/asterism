# Model configuration

Connections describe services; model records describe callable models; roles reuse model selections; agent configurations describe execution behavior. Exact schemas and defaults belong to configuration source.

## Connections and presets

A connection owns its protocol, endpoint, credentials reference, model list, and compatibility settings. A model’s service ID remains distinct from its display name. The same service ID can exist under different connections.

A preset is a one-time template for connection values and editing rules. Saving creates an ordinary connection, without a persistent preset identity or brand-dependent execution branch. Later catalog changes do not rewrite saved connections.

Plugins supply presets. Payment products and regions can require separate entries even for one brand. A subscription description does not establish client admission or authorize impersonating another client.

Fixed fields constrain connection editing without changing credential replacement or request semantics. Custom connections accept explicitly supplied endpoint and compatibility choices.

Global configuration and encrypted credentials have independent storage. Existing deletions are preserved; invalid configuration is not silently replaced with defaults.

## Model discovery and parameter lookup

Discovery uses the saved base address and its model-list endpoint, preserving the configured path. It uses the connection’s authentication and does not probe alternative addresses.

List parsing follows recognized response structure rather than provider branding. Unknown or ambiguous containers and malformed recognized metadata fail. An empty recognized list is valid.

All pages must succeed before delivering the deduplicated list. Adding models is atomic and does not overwrite existing entries. Only explicitly returned, supported metadata is imported.

Parameter lookup from models.dev returns supported capabilities and prices for the model ID entered in the editor. It matches normalized terminal model IDs exactly, with ambiguity treated as failure. The original full service ID remains the request identity.

Valid mapped fields overwrite the current draft values, using the same change detection and explicit save as manual editing. Lookup works before the model is saved and does not persist configuration or invalidate connection tests. Missing or unrepresentable metadata retains draft values with a diagnostic. Lookup does not infer compatibility packs from model names.

Input files are sent with their media types; the service determines accepted modalities. The client’s model capability switches govern reasoning and tool declaration.

## Model targets and inheritance

A model expression identifies a provider and service model, split at the first slash. Thinking is an independent selection, though historical display expressions may append a standard level.

A model target resolves a role with optional explicit model and thinking overrides. A missing override inherits the role. A nonempty invalid reference fails instead of falling back.

Roles are reusable selections, not workbench objects. Hidden roles remain usable by internal consumers; disabled roles do not resolve. The utility role does not fall back to the current conversation.

Agent configurations combine instructions, a default model role, tool policy, delegation policy, and request budget. Agent discovery exposes purpose and task examples; the chosen agent consumes its own detailed instructions.

Built-in defaults plus explicit user overrides form effective configuration. Custom roles inherit the original default role; custom agents inherit the original worker definition. Editing another effective record does not change this inheritance baseline.

False values, empty lists, null inheritance, and cleared overrides retain their distinct semantics. Tool allow/exclude policies replace as a group. Deletion does not cascade across saved references; the next resolution reports missing dependencies.

## Thinking controls

The standard levels are independent values, including explicit off. An unset level omits the upstream parameter after inheritance; off explicitly disables thinking where the protocol supports it.

The configured level set controls menus. It does not clamp or reject a saved explicit selection during request encoding. The service decides whether that value is accepted.

Disabling reasoning omits request reasoning options and historical reasoning parts while retaining saved selections and historical records. Returned reasoning is still received and displayed.

Protocol defaults map levels to effort or manual budgets. Compatibility settings can override individual mappings. They do not choose a different reasoning mode or trigger fallback requests.

Manual thinking budgets use the effective total output cap and must fit beneath it. The cap includes thinking rather than receiving an additional hidden allowance. Invalid explicit budgets fail before sending.

Conversation, naming, and compaction share encoding; minimal connectivity tests have their own request purpose.

## Compatibility settings

Compatibility packs are a finite set of declared protocol adaptations. They do not expose arbitrary request patches.

Provider and model lists merge by pack ID. A model entry replaces the whole provider entry, without deep inheritance or an implicit tombstone. Applicability hints assist selection but do not automatically enable behavior.

Packs can adapt protocol placement, supported file transport, reasoning encoding, or request identity.

## Account usage

Account balance and quota are separate from response token usage and reference cost. A connection explicitly selects a usage provider.

Active providers query using supplied connection credentials. Header providers interpret response metadata supplied by the consumer. The host catalog does not fetch credentials, cache results, or choose a connection on their behalf.

Usage items distinguish amount balance from quota windows and rate-limit headroom. Unknown limits and reset times remain unknown. An empty successful list is different from failure.

The built-in consumer shares state by connection. Query results and failures follow completion order; configuration changes invalidate the relevant state. Header refresh reads cached observations without making an artificial model request.

The consumer preserves a previous successful result when refresh fails and labels it accordingly. A predicted reset time does not manufacture new quota. Precise refresh intervals and query paths belong to the provider and consumer implementations.

## Reference pricing

Price configuration estimates API cost using current prices. It is not a provider bill, account balance, or historical price ledger.

Rates distinguish modality, charge category, unit, and quantity basis. Missing prices are unknown; zero prices mean free. Token, image, and time units are not interchangeable.

Input-length tiers select the highest applicable threshold using one request’s total input, including cache. The selected tier prices the whole request; it is not progressive billing. Missing tier rates do not inherit the base tier.

Estimate each request using its actual recorded model identity before aggregation. Deleted or ambiguous models leave price unknown. Changing current prices changes historical estimates.

Reported input already includes cache reads and writes. Reported output includes reasoning. Split only where the required quantities and prices establish a valid partition. Missing subcounts do not become zero, and inconsistent totals invalidate the split.

If input modality or its quantity is unknown, do not price it as text by assumption. Distinguish complete estimates, known partial amounts, and unknown costs. UI rounding does not change saved usage or price data.
