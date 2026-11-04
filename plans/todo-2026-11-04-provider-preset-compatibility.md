# Provider presets awaiting compatibility support

Filed on 2026-11-04. Status: deferred.

The requested provider batch comprises Alibaba Model Studio, Volcano Ark, MiniMax, Mistral, SiliconFlow, Together AI, Fireworks AI, Hugging Face Inference Providers, and NVIDIA hosted APIs. Google Gemini and Baidu Qianfan are excluded by user decision. Prefer Responses when the existing protocol and compatibility catalog can express the provider's documented contracts. Do not extend the catalog or introduce provider-specific runtime branches as part of preset maintenance.

Together AI, Fireworks AI, and Hugging Face have Responses presets. The remaining candidates below are deferred. These findings compare public documentation with the current encoder; they are not authenticated endpoint rejection reports. Documentation omissions are verification gaps, not proof that an endpoint rejects a field.

## Existing coverage

The current Responses encoder can replay plaintext reasoning in a `content` array or object, replay separate `summary` text, and preserve an original item ID alongside encrypted reasoning. Existing packs select content shape, omit encrypted-content requests, omit summary requests, move system instructions into messages, and map effort values.

The encoder does not preserve a reasoning item ID without encrypted content, add `status`, add an empty `summary` array to plaintext-only items, or map plaintext reasoning into a provider's summary field. Chat Completions uses the OpenAI SDK's standard message format and does not decode or replay `reasoning_content`. No pack injects arbitrary fields such as `enable_thinking`, `tool_stream`, or `chat_template_kwargs`.

The new presets use `responsesReasoning` with `encryptedContent: false` and `summary: false`. This omits optional request fields; it does not discard reasoning text, summaries, or encrypted continuation returned by the service.

- Together returns full reasoning in `content`, always has an empty summary, and describes requested encrypted content as a base64 copy of plaintext. Its documented effort vocabulary ends at `xhigh`, so the preset maps `max` to `xhigh` through `customThinkingLevels`. The guide lists GLM-5.2 and GLM-5.3 as supported serverless Responses models; this is a dated integration finding. Effort behavior still varies by model, including models that reason at `none`.
- Fireworks supports stateless requests with `store: false`, exposes reasoning as summaries, and does not support requesting encrypted reasoning or configuring `reasoning.summary`.
- Hugging Face documents Responses on its shared router, including streaming, conversation input, functions, and effort controls. The preset requests neither encrypted reasoning nor a generated summary; the chosen model and downstream provider determine available capabilities.

Sources:

- https://docs.together.ai/docs/inference/responses-api
- https://docs.fireworks.ai/guides/response-api
- https://huggingface.co/docs/inference-providers/en/guides/responses-api

## Alibaba Model Studio / Bailian

Candidate Responses base URLs:

| Product / region | Base URL |
| --- | --- |
| Pay-as-you-go, Beijing | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Pay-as-you-go, Singapore | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| Token Plan, Singapore | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` |

The Responses reference requires a replayed reasoning item's original `id` and `summary`. The current encoder drops the ID when no encrypted content exists. It also requires `function_call_output` to immediately follow the matching `function_call`; the current host preserves reasoning, calls, and results in historical order, including batches of multiple calls followed by results. Existing reasoning-field packs cover neither requirement.

Before adding presets, establish whether a lossless ID-preservation option and a request-only call/result ordering transform are needed. Preserve recorded history and tool-result identity. Confirm any ordering requirement against a multi-call request rather than changing the common encoder for a single provider.

The international Coding Plan uses `https://coding-intl.dashscope.aliyuncs.com/v1` and explicitly does not support Responses. A Chat preset also needs model-specific investigation: documented Qwen tool flows can require reasoning replay, and some GLM models require `tool_stream: true`. These are separate from the Token Plan and cannot be inferred from the brand.

Sources:

- https://www.alibabacloud.com/help/en/model-studio/base-url
- https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-responses
- https://www.alibabacloud.com/help/en/model-studio/compatibility-with-openai-responses-api
- https://www.alibabacloud.com/help/en/model-studio/codex
- https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling

## Volcano Ark

The products have distinct base URLs and must have separate presets when compatibility is covered:

| Product | Responses base URL |
| --- | --- |
| Pay-as-you-go | `https://ark.cn-beijing.volces.com/api/v3` |
| Agent Plan | `https://ark.cn-beijing.volces.com/api/plan/v3` |
| Coding Plan | `https://ark.cn-beijing.volces.com/api/coding/v3` |

Both plan-specific Codex guides explicitly configure `wire_api = "responses"`. Their dedicated credentials and endpoints must remain separate from pay-as-you-go access.

The Responses reference marks reasoning input `status` as required. The current encoder reconstructs reasoning items without that field, including encrypted items. Its encrypted replay already preserves the original ID and ciphertext, but its plaintext/summary replay drops the original ID. Ark's agent guide requires the original reasoning ID with encrypted replay and preservation of all items in order after the latest user message.

Investigate a request-only status encoding option and confirm the replay rules for both plaintext and encrypted models. Keep the original ID/ciphertext pairing. Do not substitute summary text for encrypted reasoning. The existing `systemMessageInMessages` pack can express a system message in `input`; Ark documents that `instructions` prevents cache use. That placement pack alone does not cover the reasoning-item gap.

Sources:

- https://ark.volcengine.com/region:cn-beijing/docs/base-url-and-authentication
- https://ark.volcengine.com/region:cn-beijing/docs/agent-plan-personal-codex
- https://ark.volcengine.com/region:cn-beijing/docs/coding-plan-personal-ai-codex
- https://ark.volcengine.com/region:cn-beijing/docs/create-model-responses-api
- https://docs.volcengine.com/docs/ark/agent-model-invocation-practice?lang=zh

## MiniMax

Candidate Responses base URLs are `https://api.minimax.cn/v1` and `https://api.minimax.io/v1`. The current quickstarts use the same regional endpoint for pay-as-you-go and M Plan, with different credentials.

The Responses schema emits plaintext reasoning in `content` with `summary: []`, but documents input reasoning through `summary` and describes input `content` only for messages. The existing encoder preserves plaintext and summaries as distinct channels. Do not reinterpret plaintext as a summary merely to fit the input schema.

Confirm whether the service accepts its own output-shaped reasoning items on replay. If it does not, agree on an explicit compatibility contract before implementing a transform. For M3.1 Flash, `none` is rejected and active efforts are `low`, `medium`, `high`, `xhigh`, and `max`; M3 has different default/off behavior. Any mappings must respect those model differences.

The Anthropic alternative does not resolve the gap by configuration alone: its current schema lists `adaptive` and `disabled`, while the installed SDK selects manual `enabled` thinking with `budget_tokens` for non-Claude models. MiniMax's acceptance of that request is unverified. Its Chat tool guide explicitly requires full assistant replay including `reasoning_content`, which the current Chat encoder does not provide.

Sources:

- https://platform.minimax.io/docs/api-reference/responses-create
- https://platform.minimax.io/docs/api-reference/text-chat-anthropic
- https://platform.minimax.io/docs/guides/text-m3-function-call
- https://platform.minimax.io/docs/guides/quickstart-preparation
- https://platform.minimaxi.com/docs/guides/quickstart-preparation

## Mistral

Candidate Responses base URL: `https://api.mistral.ai/v1`.

Mistral's official SDK defines reasoning items with required `id` and `summary`, with optional plaintext `content`. The current plaintext encoder drops the ID and omits `summary` when it is empty. Existing packs cannot supply either missing field. Confirm an explicit ID-preservation and empty-summary option before adding the Responses preset.

Effort choices belong to the model: Large 4 accepts `low`, `medium`, and `high`, while other models have different choices. Do not install a provider-wide effort mapping based on one model.

The Chat alternative returns thinking/text chunk arrays and requires preserving the full assistant message; the current standard OpenAI Chat encoder does not represent them. An exact nine-character Chat tool-call ID constraint was not established from the reviewed official documentation and is not an accepted finding.

Sources:

- https://docs.mistral.ai/api/endpoint/responses
- https://docs.mistral.ai/studio/conversations/responses
- https://docs.mistral.ai/studio/conversations/reasoning
- https://github.com/mistralai/client-python/blob/main/src/mistralai/client/models/responsesreasoningitem.py
- https://github.com/mistralai/client-python/blob/main/docs/models/responsesreasoningitem.md

## SiliconFlow

The international Chat base URL is `https://api.siliconflow.com/v1`. Verify the China endpoint separately when implementing its preset.

The interleaved-thinking guide requires DeepSeek V3.2 and GLM-4.7 tool conversations to preserve `reasoning_content` exactly and send it back unchanged. The Chat reference additionally requires `enable_thinking: false` for DeepSeek V3.1 function calling. The former needs reasoning decode/replay support; the latter needs a model-specific request-field contract. Neither is covered by the current packs. The documented R1 behavior that omits prior reasoning is a separate model contract.

Sources:

- https://docs.siliconflow.com/en/userguide/guides/interleaved-thinking
- https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions

## NVIDIA hosted API

Candidate hosted Chat base URL: `https://integrate.api.nvidia.com/v1`.

The hosted model catalog has model-specific reasoning output and control fields. The current OpenAI Chat adapter does not decode/replay vendor reasoning fields, and the catalog cannot express `chat_template_kwargs` controls. Establish the contracts of the actual hosted models before adding a reasoning-capable preset.

Downloaded NIM and local vLLM examples are not evidence that the hosted API requires the same fields. In particular, do not promote local Nemotron `force_nonempty_content` or thinking-budget examples into a universal hosted requirement. A mandatory hosted replay rule and a hosted Responses endpoint were not established by this investigation.

Sources:

- https://docs.api.nvidia.com/nim/reference/llm-overview
- https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k2-thinking
- https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b

## Follow-up acceptance

When a concrete model compatibility request is taken up, combine overlapping needs from these candidates into explicitly selected catalog options. Keep provider-neutral history, protocol behavior, and persisted formats intact. Decide any lossy transform separately; do not add arbitrary JSON patching or endpoint-name inference.

Validate each new transform at its owning boundary with independent expected request/replay shapes. Then add only the presets whose documented requirements it covers, with official source URLs and the actual verification date. Authenticated checks need a separately authorized credential and isolated conversation; none were made during this investigation.
