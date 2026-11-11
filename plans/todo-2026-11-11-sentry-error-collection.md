# Sentry error collection before the stable release

Filed on 2026-11-11.

## Requirement

Integrate Sentry before the first stable release as the application's release-error collection facility. The user confirmed this requirement on 2026-11-11. Current OOM work remains local debugging; this task does not authorize adding dependencies, sending diagnostics, or creating a remote Sentry project in this session.

## Scope

- [ ] Choose the Sentry project and deployment, and confirm the SDK dependency and packaging impact when implementation starts.
- [ ] Decide collection consent, defaults, disclosure, and retention before enabling remote reporting.
- [ ] Define a minimal payload and filtering policy. Conversation content, tool arguments and results, credentials, provider headers, local paths, and environment values require explicit treatment; raw local diagnostic reports and heap snapshots are not automatically uploadable.
- [ ] Integrate error collection at main, renderer, and task utility-process boundaries, including relevant preparation-process failures supported by the selected SDK.
- [ ] Attach the actual application release, distribution/channel, platform, and process identity so errors can be attributed to an installed build.
- [ ] Arrange private source-map and native-symbol handling for actionable packaged-build stacks without including upload credentials in the application.
- [ ] Verify JavaScript exceptions and supported native/process crashes in a packaged test build. Establish which fatal/OOM paths are captured and which still require local artifacts; do not assume every termination produces an event.
- [ ] Verify error reporting does not block startup, execution, or shutdown when offline or when the reporting service fails.
- [ ] Accept privacy behavior, installed-build attribution, and actionable reports before stable promotion.

Performance tracing, profiling, session replay, and product analytics are not part of the confirmed error-collection requirement. Decide them separately if needed. Sentry is not a replacement for local V8 heap analysis or a continuous memory recorder.

## Working references

- Official Electron SDK: https://docs.sentry.io/platforms/javascript/guides/electron/
- SDK implementation and compatibility: https://github.com/getsentry/sentry-electron
