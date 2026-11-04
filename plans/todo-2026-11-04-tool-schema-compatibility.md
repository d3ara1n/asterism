# Provider-specific tool schema compatibility packs

Filed on 2026-11-04. Status: deferred. No endpoint has rejected a current tool declaration, so no pack can be validated yet. Background and sources: `plans/ref-2026-11-04-tool-schema-provider-compatibility.md`.

## Start conditions

Begin a pack only when one of these occurs:

- A configured endpoint rejects a tool declaration, with a captured request body and error response.
- A provider's tool calls are unreliable in a way that strict mode or constrained sampling is expected to fix, and the user decides to adopt it.
- A new protocol is added whose declaration format differs from JSON Schema as currently sent (for example Gemini `parameters`).

Each pack is a separate decision and delivery. Do not prepare packs speculatively for backends that have not been observed.

## Design constraints

- Top-level tool contracts and their provider-neutral projection (`declareTool`) stay unchanged. Packs transform the projected JSON Schema at the request boundary, where `AiSdkAdapter` constructs AI SDK tools from declarations.
- Packs join the existing finite compatibility catalog (`modelCompatibilityDefinitions`), are enabled explicitly on a connection or model, and are resolved through `compatibilityForTarget`. No inference from provider names or endpoints, and no arbitrary schema patches.
- A transform that removes or weakens a constraint is lossy. Runtime validation still uses the original contract, so a lossy transform shifts the failure to argument validation; the pack declaration states this. A schema the target cannot represent fails the request with a diagnostic naming the tool and keyword rather than being sent in degraded form.
- Strict mode changes the argument wire format and requires a matching decode step; it is not a schema-only pack.

## Candidate packs

Recorded from the reference material. Confirm against the actual failing endpoint before choosing one.

1. **Typed nodes.** For backends that require `type` on every node (Gemini-compatible gateways, Kimi). Requires deciding how a typeless JSON value is represented: a lossy concrete type (LiteLLM uses object), a typed `anyOf` of all JSON types, or rejection of the tool on that connection. The choice changes what the model may send and needs user approval.
2. **`const` to `enum`.** For backends that ignore or reject `const`. Lossless.
3. **Reference sibling cleanup.** For backends that reject keywords beside `$ref`. Current declarations contain no `$ref`; relevant only if named schemas are ever allowed.
4. **OpenAI strict tools.** Make every property required, express optional and defaulted properties as nullable, close every object, drop `default`, and reject unsupported keywords per the provider's strict subset. Decode must remove `null` for originally optional properties before validation so defaults apply; history keeps the decoded arguments. Decide per tool or per connection, and whether failure to convert rejects or falls back to non-strict.
5. **Gemini protocol.** If Gemini is added natively, prefer `parametersJsonSchema`; legacy `parameters` needs an OpenAPI-subset projection and is a protocol decision rather than a pack.

## Work per pack

1. Capture the failing request and response from the real endpoint and reduce it to the offending schema keywords.
2. Present the transform, its lossiness, and the target scope for user decision.
3. Implement it as a pure function from declared parameters to provider parameters, selected by compatibility id, plus the decode step when the wire format changes.
4. Add focused tests at the transform boundary: the reported keywords, lossless rewrites, and rejection of unrepresentable schemas. For strict mode, cover the encode/decode round trip with optional and defaulted properties.
5. Verify against the real endpoint that the captured request now succeeds and a tool call round-trips through validation. The user performs or authorizes live requests.
6. Update `docs/development/model-configuration.md` to describe the pack's meaning and scope.

## Completion

Archive this plan when the user decides no further packs are expected, or when the start conditions no longer apply. Individual packs complete when the endpoint check in step 5 passes.
