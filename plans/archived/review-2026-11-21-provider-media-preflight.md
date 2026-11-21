# Provider media preflight review

Filed: 2026-11-21

Scope: local media admission and encoding in the installed AI SDK and the host model adapters. Findings are from source inspection and transport-stub tests, not live endpoint probes.

| Path | Local behavior | Disposition |
| --- | --- | --- |
| Chat tool results without `toolFilesAsUserMessage` | The host rejected the request before transport. Removing only the gate would let the SDK stringify structured output as ordinary text, not send an attachment. | Fixed: encode structured attachment parts in the tool message and expose endpoint rejection. The opt-in compatibility pack still changes the role used for the attachment. |
| Chat user attachments, including files moved by the compatibility pack | The installed Chat encoder rejects generic inline file types other than PDF after handling images and supported audio. For example, an inline CSV never reaches the server. | Fixed: preserve generic inline file parts in the user message; verify both direct attachments and those moved by the compatibility pack. |
| Responses user attachments | The installed Responses encoder has `passThroughUnsupportedFiles`, disabled by default. Inline non-image, non-PDF files can fail locally; on the diagnostic-enabled host path, `withResponsesFileRecovery` can replace the attachment with a notice and remember the omission for the endpoint/model. An HTTP rejection does not trigger recovery. | Fixed: enable generic `input_file` parts and remove local omission and its cache. Retry once only after the upstream response identifies a user attachment and an omission diagnostic can be delivered. |
| Anthropic user attachments | The installed Messages encoder throws for inline media outside the branches it can encode (for example, `text/csv`). | Fixed: send generic inline document blocks for files the SDK would reject in user content or drop from tool results. Transport tests verify encoding; live endpoint acceptance remains endpoint-specific. |

Content authorization and integrity, tool call/result pairing, and credential transport requirements protect application-owned boundaries. They are not estimates of endpoint media support.
