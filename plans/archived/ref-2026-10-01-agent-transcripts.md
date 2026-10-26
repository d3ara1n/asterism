# Agent transcript architecture research

Archived reference. Research snapshot: 2026-10-01. The material informed the separation of history, model projection, and execution. This was static source inspection, not test execution or a claim about every released version.

## Inspected versions

| Project | Commit |
| --- | --- |
| pi | `ed8b3bcc194c8263ec8bec3f337053ae73866da1` |
| OpenCode | `0112a92c416f5ad833d96e7a8308441f0a875d94` |
| Cline | `8eee168b80127b0c94bad849323754b5864865e7` |
| Codex | `a933dd77dbe101d7bd746ea3c7d1f8174eca4a05` |
| Vercel AI SDK | `45e1fbc3ea10d22f852e12b1c1851e289c85e835` |

Repository snapshots do not establish installed package versions. OpenCode contained both V1 and V2 paths, and Cline contained newer app/SDK paths; observations below apply to the inspected paths.

## pi

[AI types](https://github.com/badlogic/pi-mono/blob/ed8b3bcc194c8263ec8bec3f337053ae73866da1/packages/ai/src/types.ts) separated protocol messages and content blocks, with native continuation fields attached to relevant blocks. Provider assembly combined endpoint/model data with stream implementations.

[Agent types](https://github.com/badlogic/pi-mono/blob/ed8b3bcc194c8263ec8bec3f337053ae73866da1/packages/agent/src/types.ts) allowed richer application messages, transformed context, then converted it to model messages. Custom application content did not automatically become provider-compatible.

[Session management](https://github.com/badlogic/pi-mono/blob/ed8b3bcc194c8263ec8bec3f337053ae73866da1/packages/coding-agent/src/core/session-manager.ts) used versioned JSONL with parent-linked entries and projection. Custom records and model-visible custom messages were distinct. File-level forks differed from selecting another path within a file.

Message-end persistence did not establish token-by-token durability. AI adaptation, agent loop, application messages, and session storage had separate owners.

## OpenCode

[V1 schemas](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/schema/src/session-v1.ts) and [model conversion](https://github.com/anomalyco/opencode/blob/0112a92c416f5ad833d96e7a8308441f0a875d94/packages/opencode/src/session/message-v2.ts) distinguished message roles from content parts and tool states.

Conversion handled target-model changes and provider metadata rather than forwarding application messages unchanged. Mutable message/part tables were not a direct substitute for append-only history.

V2 paths provided event/projection examples. Their coexistence with V1 was not evidence that the entire project had completed one storage migration.

## Cline

The [inspected source tree](https://github.com/cline/cline/tree/8eee168b80127b0c94bad849323754b5864865e7) separated provider handlers, runtime codecs, session services, and storage.

Runtime accumulated tool arguments before parsing and executing complete calls. Steering reconstruction excluded incomplete tool or reasoning material when needed for continuation. That did not establish that the product never displayed or recorded those increments.

Its inspected fork path initialized a new session from source messages. That behavior did not establish shared-prefix branch semantics identical to Asterism.

## Codex

[Provider configuration](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/model-provider-info/src/lib.rs) used Responses in its wire enum. Multiple configurable providers did not imply multiple native message protocols.

The source distinguished model response items, turn presentation items, and rollout persistence. A completed tool item could start execution before the whole response ended; complete-item execution was different from executing partial arguments.

[Rollout recording](https://github.com/openai/codex/blob/a933dd77dbe101d7bd746ea3c7d1f8174eca4a05/codex-rs/rollout/src/recorder.rs) owned JSONL persistence. This supported separating model data, turn state, and storage without requiring Asterism to copy Responses-shaped storage.

## AI SDK

[Provider registration](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/ai/src/registry/provider-registry.ts) and [model-message conversion](https://github.com/vercel/ai/blob/45e1fbc3ea10d22f852e12b1c1851e289c85e835/packages/ai/src/ui/convert-to-model-messages.ts) supplied adaptation mechanisms.

Custom UI data and model content remained distinct. Conversion hooks did not define application persistence, authorization, or which custom records should reach a model.

## Design implications recorded at the time

Asterism retained its own SQLite history and content store, with separate model and UI projections. The host adapted protocols and executed bounded requests; Agent domains owned context and loops.

Native opaque data used explicit whitelists and source scope. Incompatible reasoning was not silently rewritten as ordinary assistant text.
