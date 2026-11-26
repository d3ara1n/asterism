# Language model foundation and decision model integration review

Filed: 2026-11-26. Disposition: Stage 1 foundation implemented; Stage 2 integration remains deferred in the [model category plan](../todo-2026-11-26-language-and-decision-models.md).

## Foundation and verification

- Language execution, providers, catalog, provider account usage, configuration commands, and the protocol registry are explicitly language-scoped. `ModelTarget` is the provider/model pair; `LanguageModelTarget` adds optional thinking. Generation, continuations, and tool batches still use the existing implementation.
- Configuration v17 to v18 moves the existing arrays without rewriting their payloads, model references, or credentials. Telemetry v2 to v3 classifies existing model rows as language work without rewriting token counts, estimates, or event IDs. Builtin role settings and historical record payloads did not change formats.
- A synthetic ledger check distinguishes language and decision records with identical provider/model IDs, keeps their provider attribution separate, and excludes decisions from a thinking filter. A prior-format configuration fixture verifies that a nested service model ID, its parameters, and its saved credential still resolve after migration.
- The SDK cutover is intentionally breaking: authored plugins that use the former model services, provider preset fields, catalog contracts, or account usage calls must update their imports and context access before rebuilding. A stored-data migration cannot update plugin JavaScript. There is no alias for the old SDK surface.

## Remaining boundaries and dispositions

1. **Target resolution does not prevent sharing a vendor name.** A future decision service can resolve the same `openai/gpt-6-luna` string in a separate catalog, independently of language settings and inference. Cross-category code must carry category separately; do not introduce a global raw-string resolver. Existing `model:` links and Agent selectors are language-specific. A mixed picker or decision link requires an explicit category context, with existing links left unchanged.
2. **A provider ID does not establish a shared account.** The current quota cache, notifications, and renderer call are language-scoped. A decision implementation can add its own scope or use an explicit account identity if credential sharing is approved. Do not merge balances or read a language credential just because the provider ID is equal.
3. **A shared ledger is not a shared pricing or execution contract.** It can retain distinct events and aggregates for either category. Decision question counts, partial refusal, billed amounts, and usage units still need contracts based on real provider responses. The synthetic test validates identity and grouping, not either decision protocol or its billing semantics.
4. **Discovery and parameter lookup answer different questions.** Language discovery and parameter matching stay within the existing path. A decision provider must establish support for its endpoint before advertising a model; a generic model list, familiar model ID, or catalog record is insufficient. Later catalog changes must preserve draft fields that the source does not supply.
5. **Do not reuse language request structure merely to reuse transport.** Category-specific evidence validation, refusal, and results belong to the decision service. Only pull out shared transport and measurement pieces once the second service needs them. No Agent logic, generation events, or tool execution are required to make an evaluation.

None of these findings requires changing the target string, language generation contracts, or historical record payloads when Stage 2 begins. The remaining work is integration and product design, not an implied compatibility promise for an unimplemented API.
