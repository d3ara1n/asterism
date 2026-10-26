# Plugin content ingestion

Filed on 2026-10-12; archived on 2026-10-19 after implementation and main-path user acceptance.

The host managed staging, sealing, reading, and retention of immutable bytes. Persistent JSON contained exact reserved content references; the host discovered roots from final validated values rather than a second plugin-maintained manifest.

References were neither resources nor credentials. Drafts, attempts, and active reads held distinct leases. Preparation did not prematurely release content, and failed attempts retained retryable drafts.

Bytes were prepared outside synchronous transactions; saved data and dependency roots committed together. Current data replaced its roots, while historical records retained theirs. Object and session ownership remained explicit.

Backend and frontend author examples, input transport, image paste, and resource actions were delivered. Isolated tests covered cancellation, retry, isolation, rollback, transforms, history roots, reopen with absent plugins, and active-read retention.

The user accepted the normal plugin import/action/history path on 2026-10-13. Large-upload cancellation and preparation-failure UI remained real-use observation targets. Archival did not claim those states had been manually reproduced.

Real-time media, broader sharing, and other media input/output capabilities were outside this delivery.
