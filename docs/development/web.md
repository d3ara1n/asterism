# Web providers and resources

Web resources expose application-wide search and URL-fetch providers. Provider adapters own upstream protocols; the host service owns selection, lifecycle, and common result validation. Single-page scraping is URL retrieval even when the upstream service renders a page or calls its endpoint scrape or extract.

## Provider identity and routing

A provider type has a stable slug, capabilities, URL patterns, declared settings, and instance factory. Each type has at most one saved configuration. Adding a provider adds that service; users do not name it or choose an identity.

The type slug is its configured identity. The upstream endpoint belongs to the adapter; arbitrary endpoint replacement is not part of the configuration. A proxy or self-hosted service can declare a separate provider type.

Settings use the closed set of provider setting kinds shared with other provider families; the host renders, validates, and stores them. Secret settings hold values such as API keys; their values live in the credential vault, and configuration and snapshots retain only their state. Text settings hold trimmed plain values. Choice settings hold one declared option and fall back to their declared default when unsaved. A provider that needs no credentials declares no secret. Saving validates values against the currently registered type and requires every required value to be supplied and every required secret to be kept or replaced, so a saved provider is never left incomplete. References to secrets the type no longer declares are removed with that save.

Saved unavailable types remain visible and can be removed but not edited. Duplicate type registration fails. Provider shutdown revokes contributions and waits for in-flight work.

The saved provider list defines priority and can be reordered in settings. Search tries enabled, registered search-capable providers in that order. Fetch uses the same order after filtering for fetch capability and a pattern matching the normalized full URL. Multiple matching patterns do not cause duplicate attempts.

Patterns use the declared wildcard semantics without specificity sorting. Requests with no eligible provider fail explicitly. Credential, request, and response-validation failures advance to the next eligible provider until two consecutive failures match. Matching requires the same error name and Web error code, and either the same explicit source HTTP failure status or, when neither has one, the same complete error message. Identical thrown strings also match. A different failure resets the comparison. The first valid response ends the sequence, including an empty search result. Caller cancellation stops the sequence. Invalid input fails before any provider is invoked.

Successful results identify the provider that handled the request and include hints for earlier failures. If fallback stops or all candidates fail, the error explains the stopping reason, includes each attempted provider's failure, and retains the final failure's error code and source HTTP failure status when available. Usage contains only quantities reported by the successful response; failed attempts may still incur upstream charges.

## Invocation and resources

All Web objects share the same provider service. Each object stores identity and title. Linking it grants access through the ordinary captured resource scope.

Candidate instances, settings, and secrets are resolved at the request boundary, before sequential requests begin. Configuration edits affect subsequent requests. A saved choice the current type no longer offers, or a missing required secret, fails that provider's resolution and advances to the next candidate. Provider resolution, secret reading, and requests use the provider/caller cancellation scope. Explicit resolved handles bind one instance and lifecycle; they do not perform provider fallback.

Web search and fetch remain read-only resource tools. HTTP URLs reject embedded credentials.

Per-session usage display is transient application-run state. It records actual outcomes, durations, in-flight work, reported costs by currency, and recent requests. Cursor movement does not erase those real operations.

## Common results and body budgets

Results preserve ordered source documents and distinguish snippets, excerpts, bodies, and summaries. Dates retain their reported kind and precision; missing metadata remains missing.

Typed presentation details retain provider-specific data. Hints report actual ignored filters, adjusted parameters, or other execution differences. Usage records reported quantities and units rather than estimating them.

Adapters normalize diagnostics when upstream codes and structured fields establish their meaning. Source HTTP failure statuses describe the requested page; provider API HTTP statuses remain separate diagnostics. Adapters retain explicit source failures in thrown errors so different providers' wording does not prevent matching. Unknown source statuses remain unknown rather than being inferred from message text. Recognized request fields map to public parameters; provider-only fields remain in the original diagnostic details. Unknown diagnostics retain their upstream meaning, and cancellation remains distinct from failure.

An optional fetch body budget counts Unicode code points across all body blocks of each document. Excerpts, summaries, and metadata remain separate. The common service enforces the budget after validation, including resolved-handle calls.

Providers may pass the budget upstream to reduce transfer. Only actual clipping establishes service-side truncation; asking for a limit or receiving exactly that length does not prove omitted content.

Scores retain their provider meaning and do not establish cross-provider ranking. Ordinary tool history and Agent compaction handle saved results. There is no separate Web response cache or result database.

## Built-in adapters

Adapters use official SDKs when their request interfaces support cancellation, or the provider's official HTTP API with a native cancellation signal. Both paths use the same provider lifecycle. Cancellation stops local transport and result consumption; it does not establish that the upstream service stopped processing or reversed a charge. Stopping only the caller's wait while leaving an unowned request running does not satisfy this contract.

Provider capabilities are independent. Exa, Parallel, Tavily, Firecrawl, and DeepSeek support search and URL retrieval; Perplexity exposes its standalone Search API. Search-only providers do not participate in URL retrieval. Each provider declares its own credentials and any search or extraction choices.

Unsupported filters and parameter adjustments become hints. Provider-specific limits, domain-filter precedence, localization, and date precision stay in the adapter. A date that could represent either publication or update retains an unknown kind. Upstream summaries remain summaries, and excerpts remain distinct from page bodies. Tavily focused extraction requires a second request alongside the full-body request; their identifiers and reported usage remain available in the combined result. Providers without focused excerpts report that limitation while returning the body.

Empty search is valid; failed content retrieval remains an error, including upstream success envelopes that contain page failures or no usable body. HTTP errors retain upstream details. Credit and SKU counts remain reported quantities; adapters do not infer prices or charges from a pricing table.
