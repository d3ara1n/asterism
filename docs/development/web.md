# Web providers and resources

Web resources expose application-wide search and URL-fetch providers. Provider adapters own upstream protocols; the host service owns selection, lifecycle, and common result validation.

## Provider identity and routing

A provider type has a stable slug, capabilities, URL patterns, credential declaration, internal endpoint, and instance factory. Each type has at most one saved configuration.

The type slug is its configured identity. Users enable the service and supply credentials; arbitrary endpoint replacement is not part of that configuration. A proxy or self-hosted service can declare a separate provider type.

Saved unavailable types remain visible. Duplicate type registration fails. Provider shutdown revokes contributions and waits for in-flight work.

Search selects the first enabled search-capable provider. Fetch scans enabled providers and their patterns in order, choosing the first match against the normalized full URL.

Patterns use the declared wildcard semantics without specificity sorting. No match fails explicitly. A failed selected provider does not silently fall back to another.

## Invocation and resources

All Web objects share the same provider service. Each object stores identity and title. Linking it grants access through the ordinary captured resource scope.

Provider resolution, credential reading, and requests share the provider/caller cancellation scope. Explicit resolved handles bind the selected instance and lifecycle.

Web search and fetch remain read-only resource tools. HTTP URLs reject embedded credentials.

Per-session usage display is transient application-run state. It records actual outcomes, durations, in-flight work, reported costs by currency, and recent requests. Cursor movement does not erase those real operations.

## Common results and body budgets

Results preserve ordered source documents and distinguish snippets, excerpts, bodies, and summaries. Dates retain their reported kind and precision; missing metadata remains missing.

Typed presentation details retain provider-specific data. Hints report actual ignored filters, adjusted parameters, or other execution differences. Usage records reported quantities and units rather than estimating them.

Adapters normalize diagnostics when upstream codes and structured fields establish their meaning. Recognized request fields map to public parameters; provider-only fields remain in the original diagnostic details. Unknown diagnostics retain their upstream meaning, and cancellation remains distinct from failure.

An optional fetch body budget counts Unicode code points across all body blocks of each document. Excerpts, summaries, and metadata remain separate. The common service enforces the budget after validation, including resolved-handle calls.

Providers may pass the budget upstream to reduce transfer. Only actual clipping establishes service-side truncation; asking for a limit or receiving exactly that length does not prove omitted content.

Scores retain their provider meaning and do not establish cross-provider ranking. Ordinary tool history and Agent compaction handle saved results. There is no separate Web response cache or result database.

## Built-in adapters

Exa and Parallel use their official SDKs for search and URL content retrieval. Both preserve supported filters, source metadata, provider warnings, and reported usage. Exa distinguishes text, highlights, and summaries; its API failures retain available upstream error codes, details, and request identifiers. Parallel distinguishes Markdown excerpts from page bodies and reports SKU counts without estimating currency costs.

Unsupported filters and parameter adjustments become hints. Provider-specific limits and filter precedence stay in the adapter. Empty search is valid; failed content retrieval remains an error. Cancellation passes to each SDK.
