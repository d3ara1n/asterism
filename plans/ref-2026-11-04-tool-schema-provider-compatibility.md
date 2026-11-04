# Tool parameter schemas across providers and harnesses

Reference. Research snapshot: 2026-11-04. Filed after top-level tool declarations carried a recursive `$ref` from `z.json()`, which some provider paths cannot resolve. Sources are official documentation, commit-pinned source files, and issue reports; no live provider requests were made. Recheck provider behavior before using this material in new work.

## Resolution at filing time

The SDK `jsonSchema` validates any JSON value with a non-recursive check (`z.unknown().refine(isJson)`), so every JSON Schema projection represents it as the open schema `{}`. Top-level declarations are projected with `cycles: "throw"` and `reused: "inline"`; recursive parameter schemas and named schemas that would need `$defs` fail projection with the tool name. Resource inspection keeps complete schemas. Runtime validation uses the original Zod contracts.

The same open-schema projection for arbitrary JSON is used by Pydantic v2 `JsonValue` (`any_schema()` → `{}`) and TypeBox `Type.Unknown()` / `Type.Any()` (`{}`). Zod 4 `z.json()` projects to a recursive `anyOf` that lands in `$defs` when nested; [OpenWork](https://github.com/different-ai/openwork/pull/6480) and an [MCP host](https://github.com/NEARBuilders/everything-dev/issues/670) report that definition being lost before the provider ("Pointer '/$defs/__schema0' does not exist").

## What Asterism sends

Asterism never sets `tool.strict`. In `@ai-sdk/openai` 4.0.104 and `@ai-sdk/anthropic` 4.0.91:

| Protocol | `strict` on function tools | Effect |
|---|---|---|
| `openai-responses` | `strict: tool.strict ?? false`, always sent | Non-strict |
| `openai-chat` | Omitted | Chat Completions is non-strict by default |
| `anthropic` | Omitted unless set and supported | Non-strict |

`strictJsonSchema` (default true) applies only to `response_format`, not tools. Before sending OpenAI tool schemas, the SDK removes `propertyNames` and regex patterns with lookaround and emits compatibility warnings; it does not otherwise rewrite types or references. `jsonSchema()` in provider-utils passes schemas through unchanged.

Shapes emitted by current top-level tools: typeless `{}` (`resource_call.target/args`, resource creation `input`), `default`, optional properties outside `required`, `additionalProperties: false`, `minLength`/`maximum`/`pattern`, `enum`, and arrays of objects (questions). `z.literal` produces `const`; `z.record` produces `propertyNames`.

## OpenAI strict mode

[Function calling](https://developers.openai.com/api/docs/guides/function-calling#strict-mode): Chat Completions tools are non-strict by default. Responses tools with `strict` omitted are normalized into strict mode when possible and fall back to non-strict otherwise. Strict requires `additionalProperties: false` on every object and every property in `required`; optional values are expressed by allowing `null`. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas) requires an object root (no root `anyOf`), supports `$defs` and recursion, and rejects `allOf`, `not`, `dependentRequired`, `dependentSchemas`, and `if`/`then`/`else`. An [Agents SDK report](https://github.com/openai/openai-agents-python/pull/4529) says property-level `default` can be rejected.

Not found in primary sources: strict acceptance of a nested typeless `{}`, of `propertyNames`, and non-strict acceptance of a nested `{}`. Codex sends open schemas in production with `strict: false`, which is indirect evidence for the non-strict case only.

Current Asterism schemas would not pass strict: optional and defaulted properties are absent from `required`, and `default` is present.

## Other providers

| Provider or path | Reported behavior |
|---|---|
| Anthropic strict tools | Local `$ref`/definitions supported; recursive schemas, external `$ref`, and `allOf` with `$ref` unsupported; objects need `additionalProperties: false` ([docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)) |
| Gemini `parameters` | OpenAPI-style `Schema`; `type` required, no reference fields ([proto](https://github.com/googleapis/googleapis/blob/master/google/ai/generativelanguage/v1beta/content.proto)) |
| Gemini `parametersJsonSchema` | Accepts JSON Schema; ignores `const`. AI SDK Google provider sends this on current main; older versions dropped `$ref`/`$defs` and produced untyped nodes rejected by Vertex ([#19002](https://github.com/vercel/ai/issues/19002)) |
| Gemini via OpenAI-compatible provider | 400 for nullable `anyOf` without `type`: "schema didn't specify the schema type field" ([report](https://github.com/MiniMax-AI/minimax-code/issues/544)); a gateway rejects `const` ([report](https://github.com/AstrBotDevs/AstrBot/issues/10720)) |
| Moonshot/Kimi | Enum under `anyOf` without `type` rejected: "type is not defined" ([report](https://github.com/trycua/cua/issues/4717)); `$ref` with sibling `type` rejected ([report](https://github.com/farion1231/cc-switch/issues/8766)) |
| DashScope/Qwen | A LlamaIndex adapter removed `$defs` but kept `$ref` ([report](https://github.com/run-llama/llama_index/issues/23094)); endpoint rules not found |
| OpenRouter | Upstream Anthropic/Azure rejection of root `anyOf`/`oneOf` ([report](https://github.com/uhstray-io/agent-cloud/issues/753)) |
| DeepSeek, xAI | No evidence for the shapes above |

Issue reports describe particular requests, not provider-wide guarantees. No single schema satisfies every backend: typeless nodes are rejected by some, and type arrays are absent from Gemini's OpenAPI subset.

## Harness approaches

- **Codex CLI** ([source](https://github.com/openai/codex/blob/021fccb046508938c4754982efccfb51d6e8356e/codex-rs/tools/src/json_schema.rs#L130)): MCP schemas normalized by inferring missing types from structural hints, clearing unhinted nodes to `{}`, keeping local refs; sent with `strict: false`.
- **opencode** ([source](https://github.com/sst/opencode/blob/b3fd4a75fe539a65168139cec2edd29ceb7724f6/packages/ai/src/protocols/utils/tool-schema.ts#L61)): per-provider projection. Gemini filters `required` and handles recursive refs; Moonshot infers enum types and drops `$ref` siblings. OpenAI Chat sends `strict: false` where supported.
- **Cline** ([source](https://github.com/cline/cline/blob/7a7878cb52fc33967d8b464b3e3d899beac42d4d/sdk/packages/llms/src/providers/ai-sdk.ts#L880)): root `type: object` only; `strictJsonSchema: false`.
- **LiteLLM** ([source](https://github.com/BerriAI/litellm/blob/fd4cef22eafaf5e1c18f3a5af6df252a16fa5cce/litellm/llms/vertex_ai/common_utils.py#L852)): Gemini/Vertex path types `{}` as object, resolves `$defs`, maps null branches to `nullable`, filters `propertyNames`, removes `strict`.
- **OpenAI Agents SDK** ([source](https://github.com/openai/openai-agents-python/blob/23e9996ac146109bdcd9b871e3564f70dc13aae1/src/agents/strict_schema.py#L224)): strict by default; closes objects, marks all properties required, raises on open `additionalProperties`.
- **pi**: strict is per-tool opt-in (`prefer` falls back to non-strict when conversion fails, `require` errors). The strict converter rejects `$ref`, `$defs`, `allOf`, `oneOf`, `propertyNames`, conditionals, tuples, and object/array unions; makes optional properties nullable and every property required. Gemini uses `parametersJsonSchema` with `const` rewritten to `enum`; the legacy `parameters` path sanitizes separately.

Common practice: a provider-neutral canonical schema, strict off by default, and per-provider adaptation at the request boundary rather than changes to the canonical schema.

## Assessment at filing time

No rejection of current declarations by official OpenAI or Anthropic endpoints in non-strict mode had been observed or reported; acceptance of nested `{}` there rests on production practice, not documentation. The remaining exposure is `openai-chat` connections to relays that forward to backends requiring `type` on every node or rejecting `const`; the previous `z.json()` projection failed on those backends too. Strict mode needs a dedicated projection and a decode step, not a flag change.
