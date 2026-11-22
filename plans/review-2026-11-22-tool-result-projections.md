# Tool result projections and redundant output

Filed: 2026-11-22

Scope: source review and local fixtures for selected host and builtin tool paths. No production frequency or token-cost measurements. Fixture sizes below count Unicode code points, not tokens.

## Separate the consumers

Finalized outcomes currently store both typed `data` (used by renderers and `resource_script`) and the model projection. The normal model request uses the projection, not `data`. Without a tool-specific projection the SDK serializes the entire decoded result as JSON. Improve the owning tools before considering a change to that plugin default; JSON payloads sometimes are the requested result.

The text mutation card renders the diff; it does not use the anchor bodies. For `edit`, preserve the diff for the user, store new anchor coordinates and hashes without line bodies, and keep only reusable anchors and the change summary in the model view. Update the active tool contract and its consumers together. Completed records stay unchanged; there is no migration or requirement to retain old tool input and output shapes. The previous compact model-only change reduced a local 1,135-character call's projection from 3,115 to 124 while its formatted `data` remained 3,299 characters. For `write`, the model already receives a summary; the retained patch is a separate size concern. Removing it, bounding it, or making the presentation non-blocking would change the result behavior. Today `textChange` rejects a mutation before writing when its diff computation exceeds the budget. Decide what diff users need before changing that behavior.

## Initial findings

| Path | Verified output | Suggested shape |
| --- | --- | --- |
| Edit anchor mismatch (`shared/text.ts`, `shared/hashline/apply.ts`) | The failure renders every mismatch with no aggregate budget. A local batch of 50 stale anchors against 4,000-character lines emitted 202,856 characters. | Keep full validation and atomicity. Report unique recovery anchors directly, retain coordinates and hashes for ambiguous candidates, and bound the live line excerpts. See the comparison below. |
| Bulk `replace` (`shared/replace.ts`, `shared/text.ts`) | Match count, bounded diff with context and both sides, then a second copy of new lines in anchor rows. Diff and anchors have independent budgets. A local literal replacement of 30 short prefixes in roughly 1,000-character lines emitted 77,054 characters. | Keep match/change counts and anchors in the model receipt; keep the actual patch in the user result. |
| Directory `list` (`filesystem/runtime.ts`) | Defaults to JSON. Every file repeats the resource identity and its path inside a `FileRef` as well as its entry name. A 100-file fixture emitted 19,353 characters; the path and names alone were 1,212 characters. The latter is a baseline, not a proposed serialized result. | Project a shared source identity once, mark entry types, keep truncation visible, and make it possible to construct the exact references still needed by file-consuming tools. |
| `web_search` and `web_fetch` (`web/runtime.ts`, provider adapters) | The JSON fallback sends normalized document content plus provider details, request IDs, and usage. Exa can duplicate a structured summary across content and details. Full bodies can arrive alongside overlapping excerpts; the supplied fetch body limit does not cover excerpts or metadata. | Project source identity, provider-supplied content, and material hints; leave telemetry and provider diagnostics out. Preserve the provider's content boundaries and honor explicit request limits. Do not infer whether a summary contains a body, compare text for overlap, or repair provider content in the projection. |
| `chat_send` (`messaging/runtime.ts`) | The model receives the accepted message body and attachment references again via the same projector used for reading. The UI uses the accepted body. | Use a short model receipt with the new message ID and useful delivery facts. Preserve the user's rendered sent-message view. |
| MCP call conversion (`mcp/content.ts`, `mcp/result.ts`) | The duplicate check compares parsed JSON via stringification. It removes an identical JSON text copy from the model output but misses equivalent objects with reordered keys; both copies are still stored in `data`. | Compare JSON structurally and preserve distinct text and required content parts. Do not assume that text and structured data are always interchangeable. |
| Peek retrieval (`agent/peek/snapshot.ts`, `agent/peek/retrieval.ts`) | The initial outline includes only labels for tool records; it includes all dialogue and summaries. Retrieving a tool record can deliver arguments, raw `data`, and the model projection together. | Default to the model view and needed call context; retrieve user-facing detail separately when it contains evidence the question requires. Budget the initial outline separately if needed. |

## Comparison with Pi Hashline Edit

The neighboring `pi-extensions/packages/pi-hashline-edit` separates successful model output from the UI diff. `src/pi/edit-tool.ts` returns an edit summary and up to 40 touched lines with hashes and full line bodies; it places the diff and patch in `details`, not in model-facing `content`. Asterism's previous successful projection added the diff alongside anchor rows, so that part of the duplication came from Asterism.

Pi collects all mismatches in `src/core/apply.ts` and formats them in `src/pi/edit-tool.ts`. It reports a ready-to-use anchor on a unique shift, all candidate coordinates and hashes on an ambiguous shift, and the entire current line if no nearby line matches. It does not bound that diagnostic as a batch. Before the changes below, Asterism retained these recovery branches and excerpted exceptionally long lines using the regular read threshold. The measured bulk failure therefore reflects an inherited output shape, not a flaw in shifted-anchor validation.

Keep the recovery algorithm and atomic batch behavior. Format a unique shift as an operation field and replacement anchor; retain ambiguity rather than picking a candidate. For a genuinely changed line, show its current anchor and a short excerpt, with one shared limit on live previews and an anchored read available when more context is needed. The formatter owns these decisions; no changes to core search, automatic retries, or new state are needed.

## Follow-up boundaries

`resource_inspect`, MCP inspection, `read`, and `exec` return information the caller explicitly requests. Their length is not on its own evidence of redundancy; keep discovery schemas and requested content usable. `resource_script` already projects explicit logs and the return value rather than dumping child outcomes. It still allows callers to return redundant data themselves. Do not add a blanket host string cutoff in place of semantic limits and useful continuation markers owned by each tool.

Directory listing, chat send, MCP, and Peek remain outside this change. Assess persisted `data` separately from model projection length, and preserve the identifiers and continuation markers required by downstream calls. Completed records remain unchanged.

## Runtime follow-up

`edit` and `replace` now store line/hash anchors without body text and project receipts without diffs. The single-line edit fixture produces a 58-character model receipt (124 after the earlier model-only change) and a 2,505-character result JSON (previously 3,299). The bulk replace fixture produces a 296-character receipt. The 50-mismatch fixture now emits 3,006 characters while still identifying each stale operation and the current anchor. Web tools project source content and known result conditions separately from provider diagnostics; host provider routing and SDK responses are unchanged.
