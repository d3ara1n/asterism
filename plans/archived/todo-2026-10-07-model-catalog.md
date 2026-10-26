# Model discovery and parameter lookup

Filed on 2026-10-07. Completed and archived after user confirmation of function and GUI behavior on 2026-10-14.

Saved connections could discover endpoint models, search and select additions, and atomically add them without overwriting existing entries. Manual model addition remained available.

Provider presets described connections rather than maintaining model catalogs. Lookup used models.dev with exact model-name matching after removing routing prefixes for comparison only; stored service IDs remained unchanged. Missing or ambiguous information was reported instead of guessed.

Explicit lookup overwrote representable parameters, while network failure retained current values. No background configuration refresh or implicit catalog cache was introduced. Price consumption was deferred from this delivery.

Focused tests covered protocols, matching, mapping, persistence, and then-current request invalidation behavior. Typechecks, the suite, localization checks, and build passed. Automation used injected transport and isolated configuration; GUI confirmation came from the user.

The record predates later simplification of runtime revision checks and later pricing support.
