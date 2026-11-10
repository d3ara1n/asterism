# Native provider compaction

Filed on 2026-11-10. Deferred from the compaction thinking-level and failure-feedback fix; nothing is decided yet.

## Background

Asterism compacts by asking the conversation model for a text summary and appending a `ContextSummary` record. Some providers offer their own compaction:

- OpenAI Responses: append a `compaction_trigger` input item, or call `POST /responses/compact`. The output is an encrypted `compaction` item that later requests send in place of the summarized history. Server-side threshold compaction (`context_management` with `compact_threshold`) also exists.
- Anthropic Messages (beta): a request with the `compaction` option returns a `compaction` block with stop reason `compaction`; later requests send it first in `messages`. Threshold compaction uses the `compact_20260112` context-management edit.

The locked AI SDK versions already expose both: OpenAI `compactionTrigger` with an `openai.compaction` custom part, and Anthropic `compaction` / `contextManagement` provider options.

Other harnesses for reference: OpenCode enables it per provider or model with `settings.compaction.type: native | summary` (model overrides provider) and keeps a recent tail within the same token budget as local summaries. Codex uses the Responses compaction endpoint for OpenAI models.

## Likely shape

- An opt-in compatibility pack for `openai-responses` and `anthropic`, because relays usually do not support native compaction. The pack's provider/model merge matches OpenCode's override rule.
- A protocol capability for native compaction exposed through the model services, so builtin can request it.
- Storage: `ContextSummary` requires non-empty summary text. Native output needs a native payload carrying its continuation format and provider/model scope, like existing continuation data.
- Projection: send the native item when the scope matches; otherwise a readable fallback is needed.

## Open questions

- [ ] Model switching: OpenAI's item is encrypted and model-bound with no readable text. Options include generating a local summary as well (double cost), dropping the compacted prefix on switch, or limiting native compaction to providers with readable output. Verify whether Anthropic's compaction block content is readable text.
- [ ] Failure: whether a native failure reports and stops, or falls back to a local summary. The project principle favors exposed failure without uncontracted fallback.
- [ ] Record format change and its user approval.
- [ ] Threshold (server-side) compaction versus explicit on-demand compaction, and how either fits the Agent's own budget trigger.
