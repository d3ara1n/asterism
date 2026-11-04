# Freeform tool input across provider APIs and agent harnesses

Reference. Research snapshot: 2026-11-04. Filed against a possible future need: `resource_script` embeds JavaScript in a JSON string parameter, so the model must JSON-escape its code. No escaping failures had been observed at filing time; the motivation was precautionary. Recheck provider capabilities before using this material in new work.

## The two-field question

A freeform tool call seems to require two fields (tool name and parameters), which appears to force a JSON wrapper and therefore escaping. The survey found three escape paths in production systems:

1. **Envelope with one opaque string.** The name stays a short structured field; the entire input collapses into a single arbitrary string with no keys or nesting.
2. **Syntax-delimited text protocols.** The name is a syntax element (tag, heading, line label, identifier), not a data field; arguments are delimited raw text.
3. **Code as the call.** Tool names are function identifiers and arguments are language expressions.

"Freeform" in practice means exactly one free slot, never the absence of all structure. Escaping may still exist mechanically on the wire; the meaningful boundary is whether the model must author object structure, key names, and per-field escape decisions.

## Provider APIs

[OpenAI custom tools](https://developers.openai.com/api/docs/guides/function-calling) are the only first-class freeform tool type. Declaration carries no schema; the input format is described in prose:

```json
{ "type": "custom", "name": "code_exec", "description": "Executes arbitrary Python code." }
```

The call returns `{ "type": "custom_tool_call", "call_id": "...", "name": "code_exec", "input": "print(\"hello world\")" }` (Responses API; Chat Completions nests it as `custom: { name, input }`). Structure, when needed, comes from a grammar rather than JSON: `format: { "type": "grammar", "syntax": "lark" | "regex", "definition": "..." }`, enforced at sampling time via LLGuidance (Rust regex syntax; no lookarounds or lazy quantifiers). Stated rationale: "to avoid unnecessarily wrapping a response in JSON, or to apply a custom grammar".

The most refined real-world use is Codex CLI's `apply_patch`: a custom tool whose description reads "This is a FREEFORM tool, so do not wrap the patch in JSON", constrained by a Lark grammar for the patch format ([captured request body](https://github.com/Wei-Shaw/sub2api/issues/3390)).

[Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) has no freeform tool type in the public Messages API. "Custom tool" in current docs means a user-defined tool whose `input_schema` is required and must be an object; `{"type": "string"}` is rejected. Managed Agents' `type: "custom"` also carries a JSON schema. [Gemini/Vertex](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/function-calling) has no equivalent; `functionCall.args` is always a Struct.

## Harness text protocols

Cline parses an XML-like tag protocol with a streaming state machine (tag matching via `startsWith`, partial blocks while unclosed): `<write_to_file><path>...</path><content>raw file text</content></write_to_file>`. Nested `</content>` inside payloads gets a per-tool special case (first `<content>` to last `</content>`), illustrating the delimiter-collision cost. Roo Code later migrated back to provider-native calling ("Use the provider-native tool-calling mechanism. Do not include XML markup"). Aider's SEARCH/REPLACE blocks carry the filename on the line above the fence and raw old/new text between marker lines; the "tool" is implicit in the block shape. Classic ReAct splits name and a single text input across `Action:` / `Action Input:` line labels.

smolagents CodeAct expresses calls as Python (`image_qa(image=image, question=q)`); an AST-walking executor resolves identifiers against registered tools and evaluates arguments. OpenHands evolved from raw CodeAct to a single function tool `execute_ipython_cell` whose `code` parameter carries everything — a convergence back to the one-string-slot baseline.

Correction to a widespread claim: [Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) does not use a markdown tool-call protocol. It uses Hermes-format JSON tool calls and constrains tool *selection* by response prefill (up to `{"name": "browser_` plus prefix) and logits masking — a decode-time constraint on the name field, not an input-format mechanism.

## AI SDK status

`@ai-sdk/openai` exposes `openai.tools.customTool` ("Custom tools return a raw string instead of JSON", optional regex/Lark constraint) for the Responses protocol; the installed 4.0.104 has it. The support is provider-specific: the Anthropic adapter has no equivalent, and the generic `inputSchema` path stays zod/JSON-Schema objects. A `z.string()` inputSchema does not produce a freeform provider declaration.

## Asterism assessment at filing time

`ResourceScript` declares `z.strictObject({ code, timeout_ms })` (`src/tools/core.ts`); `AiSdkAdapter` converts every tool uniformly through `tool({ description, inputSchema })` (`src/model/ai-sdk.ts`). The failure mechanism freeform would remove: one escaping slip rejects the whole call at JSON parse, wasting a turn. Coverage is the problem: only the `openai-responses` protocol could use it, models most prone to escaping errors run on chat-compatible protocols without custom tools, and Anthropic offers no path.

## Implementation shape if ever adopted

Prefer an adapter-level projection over a first-class SDK tool type. Keep `defineTool` unchanged; in the adapter, when the protocol is `openai-responses` and a tool qualifies (single required string parameter or explicit opt-in), register `openai.tools.customTool` instead of `tool()`. Normalize the returned string back to `{ code }` at the decode boundary so execution, history, and the UI keep one shape across providers; unwrap again during replay in `sdkMessages` with continuation handling. `timeout_ms` has no room in a custom-tool envelope (name only), so adopting freeform requires deciding whether it leaves the model-facing surface. Revisit triggers: Anthropic gains freeform support, the AI SDK generalizes string input schemas, or `invalid_tool_call` clusters appear on Responses models.
