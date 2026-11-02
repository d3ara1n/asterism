# Adopt models.dev v2 through the official SDK

Filed on 2026-11-02. Status: deferred until the official models.dev SDK 2.0 release supports the v2 catalog API.

## Goal and start condition

Use models.dev v2 metadata to improve Asterism's explicit model-parameter lookup through the official SDK. Begin implementation after the official SDK 2.0 release is available and documents support for the v2 API. Verify the package identity, release status, supported endpoint, and public types at that time.

Keep the current SDK integration until this condition is met. Release monitoring and automatic dependency updates are outside this task.

## Current baseline

Asterism depends on `@opencode-ai/models` 0.0.119 and loads `/catalog.json` through `Models.make().catalog()`. The adapter maps context and output limits, reasoning and tool support, representable thinking levels, and reference prices into the model editor's draft.

Lookup matches normalized terminal model IDs, rejects ambiguous matches, and preserves the original service ID. It prefers the original provider's offering for reference parameters rather than selecting a relay's overrides. Missing or unrepresentable fields retain existing draft values and appear in the lookup diagnostic. Saving remains explicit.

As investigated on the filing date, upstream publishes an experimental v2 endpoint at `/experimental/v2.0/api.json`. Its source schema includes canonical identity, protocol-specific API metadata and capability overrides, richer reasoning configuration, and pricing information. The current official client exposes the compatibility catalog rather than a dedicated v2 API. Recheck these observations against the released SDK before implementation.

## Planned work

1. Inspect the released SDK and v2 contract. Compare its identity, provider offering, protocol, reasoning, limit, and pricing semantics with the fields Asterism currently consumes. Confirm which fields are populated in published data.
2. Upgrade the official SDK and replace the compatibility catalog transport and types with its supported v2 interface. Keep external catalog shapes at the configuration adapter boundary.
3. Port identity matching and existing parameter conversion to v2. Preserve service IDs, ambiguity handling, original-provider reference semantics, explicit draft updates, and diagnostics for missing or unrepresentable data.
4. Evaluate protocol-specific metadata against Asterism's configured request protocols. Map fields that have a direct equivalent in the existing configuration contract. Present any proposed change to lookup inputs, matching semantics, compatibility behavior, or configuration/storage contracts for user decision before implementing it.
5. Review richer reasoning and pricing data for additional representable values. Preserve the distinction between supported effort levels, boolean toggles, and token budgets, and between reference prices and actual connection billing. Report unsupported values rather than approximating them.
6. Update focused adapter tests and model-configuration documentation to describe the resulting behavior. Remove superseded compatibility-format conversion code where the supported v2 contract makes it unnecessary.

## Scope boundaries

The initial delivery adopts the SDK and preserves the existing lookup workflow. Protocol metadata may support more accurate parameter lookup, but it does not authorize automatic changes to connection protocols, endpoints, credentials, compatibility packs, or saved model records.

Additional capability controls, reasoning modes, service-tier selection, provider presets, and pricing dimensions require separate decisions if they change domain semantics or external behavior. Input modalities remain governed by the current file-submission contract unless a change is explicitly approved.

No inference transport replacement, automatic catalog refresh, snapshot fallback, or configuration migration is included solely because the upstream catalog format changes.

## Validation and completion

- Verify deterministic conversion at the adapter boundary using isolated fixtures based on the released v2 contract. Cover changed failure mechanisms: identity ambiguity, capability precedence where applicable, unsupported reasoning values, and pricing units or thresholds.
- Preserve existing tests where their contract remains relevant; replace fixtures and assertions tied to the retired external format.
- Run the affected typechecks and focused tests. Run UI checks and builds if the implementation changes editor code; the user accepts GUI behavior manually.
- Check documentation for accuracy, consistent terminology, English language, and standalone readability.
- Complete when explicit lookup uses the official SDK's v2 interface, existing supported fields retain their documented semantics, unsupported metadata is reported accurately, and the relevant checks pass. Archive this plan after disposition.

## Upstream references

- Repository and release documentation: https://github.com/anomalyco/models.dev
- v2 schema inspected during research: https://github.com/anomalyco/models.dev/blob/2627e52a40d0491ffc1c1814b2ee11cf61fc9f58/packages/core/src/schema-v2.ts
- Official client inspected during research: https://github.com/anomalyco/models.dev/blob/2627e52a40d0491ffc1c1814b2ee11cf61fc9f58/packages/sdk/src/client.ts
- Experimental endpoint at filing time: https://models.dev/experimental/v2.0/api.json
