# Anthropic `cache_control` across harnesses and endpoints

Reference. Research snapshot: 2026-11-23. Filed before any prompt-caching support exists in Asterism: the `anthropic` protocol sends no `cache_control`, on blocks or at the top level, so Claude API requests pay full input price after every turn. Sources are official documentation, the installed `@ai-sdk/anthropic` 4.0.91 package, commit-pinned harness sources, and issue reports. No live provider requests were made. Recheck provider behavior before using this material in new work.

The motivating assumption was that the Anthropic protocol rejects extra fields and that a request without `cache_control` gets no cache. The first half holds for Anthropic and is enforced more loosely by most compatible endpoints; the second half holds only for Anthropic-hosted Claude. Several compatible endpoints cache with no marker at all and ignore block markers when sent.

## Protocol facts

From the [prompt caching guide](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

| Fact | Rule | When violated |
|---|---|---|
| Placement | On a content block: `system[]` blocks, `messages[].content[]` blocks (text, image, document, `tool_use`, `tool_result`), `tools[]`. Not on the message object. Not on thinking blocks, empty text blocks, or sub-content such as citations. | Placement on a non-cacheable block: not documented. Empty text: 400 `cache_control cannot be set for empty text blocks` (user report, [claude-code #62396](https://github.com/anthropics/claude-code/issues/62396)). |
| Limit | Up to 4 breakpoints. The automatic slot counts toward the 4. No model or tier exception is documented. | 400 `invalid_request_error`: `A maximum of 4 blocks with cache_control may be provided. Found 5.` (user report, [claude-code #8419](https://github.com/anthropics/claude-code/issues/8419)). |
| TTL | `"ttl": "5m"` (default) or `"1h"` on every platform that supports caching. 5m writes 1.25x, 1h writes 2x, reads 0.1x base input, with per-model exceptions. | 1h after 5m in prompt order: 400 `a ttl='1h' cache_control block must not come after a ttl='5m' cache_control block` (user report, [claude-code #37188](https://github.com/anthropics/claude-code/issues/37188)). `cache_control.ttl: 1h is not supported` is listed by [LiteLLM](https://docs.litellm.ai/docs/anthropic_unified/native_passthrough) as a possible upstream error for an unsupported TTL. |
| Minimum prefix | 512 to 4,096 tokens depending on model and platform. | Below the minimum: processed without caching, no error, both cache usage fields 0. |
| Ordering | Prefix hierarchy is `tools`, then `system`, then `messages`. A change at a level invalidates that level and all later ones. | |
| Lookback | Reads check at most 20 positions back from a breakpoint, and only for entries that an earlier request wrote at its own breakpoint. A run of consecutive `tool_use` blocks counts as one position, as does a run of `tool_result` blocks. | |
| Beta header | None required on the stable `messages` endpoint. | |
| Usage | `cache_read_input_tokens`, `cache_creation_input_tokens`, and `input_tokens`, which excludes both. Total input is the sum of the three. | |

Issue-reported error strings are observations, not a stable contract.

### Automatic caching

A single top-level `cache_control: {"type": "ephemeral"}`, optionally with `ttl`, is stable on every platform except Bedrock `bedrock-runtime`, where it returns 400. The API moves the breakpoint to the last cacheable block as the conversation grows. The guide recommends it as the starting point for multi-turn conversations.

- Combined with explicit block breakpoints, it uses one of the 4 slots.
- Last block explicitly marked with the same TTL: no-op. With a different TTL: 400.
- 4 explicit breakpoints already present: 400.
- Last block not eligible: walks backward; if none is eligible, caching is skipped.

It has the same failure mode as a marker on the last block: when the final block changes every request (timestamp, per-request context), every request writes a new entry and never reads. In that structure the breakpoint belongs at the end of the static prefix.

## `@ai-sdk/anthropic` 4.0.91 (installed)

- Explicit breakpoints are set per location with `providerOptions.anthropic.cacheControl`: on a system message, on a message or a message part, or on a `tool()` definition. The helper reads `cacheControl` or `cache_control` under the provider-options namespace, falling back to `anthropic`. Thinking and redacted-thinking parts are non-cacheable and produce an `unsupported` warning. [`src/get-cache-control.ts`](https://unpkg.com/@ai-sdk/anthropic@4.0.91/src/get-cache-control.ts), [`src/convert-to-anthropic-prompt.ts`](https://unpkg.com/@ai-sdk/anthropic@4.0.91/src/convert-to-anthropic-prompt.ts).
- Call-level `providerOptions.anthropic.cacheControl` is copied to top-level `cache_control` and is not counted by the explicit-breakpoint validator (`dist/internal/index.js:3813`).
- `CacheControlValidator` holds `MAX_CACHE_BREAKPOINTS = 4` as a constant, is not model-aware, and never throws: a fifth breakpoint is dropped with a warning. The prompt is converted before tools, so message breakpoints consume slots before tool breakpoints regardless of wire order.
- `ttl: '5m' | '1h'` is forwarded.

## How other harnesses place breakpoints

| Harness | Placement | Count | Source |
|---|---|---|---|
| Claude Code | Stable tools and system first; explicit markers in the conversation; when a gateway rejects a marked mid-conversation system-context block, the marker moves to the last conversation message. Exact positions per version: not established. | | [Claude Code caching](https://code.claude.com/docs/en/prompt-caching) |
| Cline v3.19.7 | System text block; last content block of the second-last `user` message; last content block of the last `user` message. | 3 | [source](https://github.com/cline/cline/blob/v3.19.7/src/api/providers/anthropic.ts) |
| Roo Code (`main`, unpinned) | Same as Cline for the models in its switch. | 3 | [source](https://github.com/RooCodeInc/Roo-Code/blob/main/src/api/providers/anthropic.ts) |
| opencode `f4107529` | First two system messages; last two non-system messages of any role. Skips this strategy when automatic `cacheControl` is configured. | 4 | [source](https://github.com/anomalyco/opencode/blob/f4107529f62fce84bd89fb9576714916b1d8a229/packages/opencode/src/provider/transform.ts) |
| Aider `5dc9490b` | Fixed chunk boundaries: examples or system, repo map or read-only files, chat files. | 3 | [source](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/chat_chunks.py) |
| Codex CLI | No Anthropic Messages wire protocol. | | [config reference](https://developers.openai.com/codex/config-reference) |

Recurring choices: a marker on the stable prefix; a moving marker on the conversation tail; a second marker one turn back, which keeps a written entry inside the 20-position lookback when a turn adds many blocks; no explicit tool marker, because the system marker's prefix already covers the tools; default 5m TTL. All inspected harnesses mark Anthropic `user`-role or non-system messages, which covers tool results, and none places a dedicated marker on the last `tool` definition.

Claude Code reports one-hour TTL for the main conversation on subscription plans and five minutes on API-key billing ([source](https://code.claude.com/docs/en/prompt-caching)).

## Compatible endpoints

“Documented” means the provider states it; no request was sent.

| Endpoint | Block marker | Top-level marker | Cache without any marker | Confidence |
|---|---|---|---|---|
| Anthropic Claude API, Vertex, Bedrock | Honored | Honored (400 on `bedrock-runtime`) | None | Documented |
| Kimi `/anthropic/v1/messages` | Ignored inside the message body; system and tools not stated | Sets TTL only | Yes, 5m by default | Documented ([guide](https://platform.moonshot.ai/docs/guide/context-caching)) |
| DeepSeek `/anthropic` | Ignored on tools, text, `tool_use`, `tool_result`; system not stated | Not stated | Yes, automatic; `cache_creation_input_tokens` always 0 | Documented ([guide](https://api-docs.deepseek.com/guides/anthropic_api/)) |
| MiniMax `.io` | Honored on system, message text, tools, `tool_use`, `tool_result` for the M2 explicit-cache list; with more than 4 markers, the latest 4 are used | Not stated | Passive caching on a different model list | Documented ([guide](https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache)) |
| Z.ai / BigModel Anthropic route | Not stated | Not stated | Chat Completions has implicit caching; the Messages route is not stated | Unknown |
| OpenRouter `/api/v1/messages` | Forwarded per route | Forwarded per route | Depends on upstream | Documented, route-dependent |
| LiteLLM | Native Anthropic, Bedrock, and Vertex routes forward as sent. Opt-in native passthrough keeps the marker but reduces it to `{"type":"ephemeral"}`, dropping `ttl`, unless `cache_control_ttl: true`. Translated routes to providers without native Messages drop the markers. | | Configurable injection, off by default | Documented ([guide](https://docs.litellm.ai/docs/anthropic_unified/native_passthrough)) |
| new-api | A Messages-to-OpenAI conversion route forwarded a block marker to a strict upstream: 400 `Extra inputs are not permitted` ([#5982](https://github.com/QuantumNous/new-api/issues/5982)). An OpenAI-to-Claude conversion dropped markers before a fix ([#5335](https://github.com/QuantumNous/new-api/issues/5335)). | | | Issue reports |
| claude-code-router | The `Anthropic` transformer preserves the request; the optional `cleancache` transformer removes `cache_control`. | | | [README](https://github.com/musistudio/claude-code-router) |
| claude-relay-service `cd9a2025` | Counted markers and, above 4, removed whole marked content blocks. | | | [Source at pinned SHA](https://github.com/Wei-Shaw/claude-relay-service/blob/cd9a2025b281732e3217d5e642be63da93eef2e3/src/services/claudeRelayService.js#L712-L811) |
| sub2api | An issue reports a version that stripped client message markers and injected its own ([#2369](https://github.com/Wei-Shaw/sub2api/issues/2369)). | | Reported | Issue report |
| CommandCode | A third-party review observed a system-block marker writing 3,921 tokens and reading 3,910 on the next request ([review](https://github.com/Mars-Sea/dsh-commandcode-provider/blob/main/docs/issue-64-cache-review.md)). | | | Community observation |

General rejection of unknown fields is not documented for any of these endpoints. DeepSeek documents ignored fields individually (`top_k`, `container`, `service_tier`, `cache_control`) and rejects others individually (`tools[].type: "custom"` with 422).

## Assessment at filing time

- The failure the user is concerned about exists in two forms, and both are observed: a 400 from Anthropic for a fifth breakpoint, and a 400 from a strict upstream behind a converting gateway for any `cache_control` at all.
- “No marker, no cache” is true for Anthropic-hosted Claude and false for Kimi and DeepSeek. For those, sending markers changes nothing and `cache_read_input_tokens` already reports hits.
- Usage accounting is in place: `Usage.cacheRead` and `cacheWrite` are parsed, priced, and shown. Only the request side is missing.
- The wire body is already rewritten after SDK serialization in `withRequestEncoding` (`src/model/request-encoding.ts`), and the compatibility catalog is already merged per target in `compatibility(target)` (`src/model/compatibility.ts`). Either location can carry a per-connection cache policy without a new mechanism.

## Design candidates

Recorded as reference, not an approved or implemented design.

1. **Top-level automatic caching.** One field, no placement logic, cannot exceed the breakpoint limit by its own count, and is the shape that Kimi documents for its Messages route. Its known cost is a wasted write per request when the final block varies, and a 400 on `bedrock-runtime`.
2. **Explicit tail markers.** System block plus the last two user messages, as in Cline and Roo Code. Needs string-to-block conversion for `system` and for string message content, and must skip empty text blocks and thinking blocks.
3. **Both.** Automatic caching plus an explicit system marker, which keeps a stable entry when the automatic marker lands on varying content. Uses 2 of 4 slots; TTLs must match, or the 1h marker must come first.

Any candidate needs an explicit selection through the compatibility catalog, because an Anthropic-protocol connection is not evidence that the endpoint honors the field. A selector would have to express at least: no marker, top-level TTL selector, block breakpoints, and TTL. Which connections receive which value is a user decision and needs one captured request and response per endpoint.
