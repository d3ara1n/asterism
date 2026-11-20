# Telemetry and Dashboard

Usage telemetry is a host-owned, paradigm-neutral capability that records model requests, tool invocations, and plugin-reported external metered usage across all plugins.

## Storage isolation

Telemetry uses its own SQLite database under `telemetry/telemetry.sqlite`, completely separate from `db/workspace.sqlite`:

- **No recovery-point coupling**: Telemetry is analytical history, not workspace business state. It is excluded from `applicationDataPaths` so restoring a workspace recovery point never rewinds or blocks on telemetry.
- **Independent lifecycle and fault isolation**: Deleting or expiring sessions does not cascade into the telemetry ledger. Schema migrations use `PRAGMA user_version` independently inside `src/telemetry/storage.ts`; corruption or an unrecoverable migration quarantines the old file and initializes a fresh ledger without blocking startup.
- **No content retention**: Records store only structured metrics (timestamps, durations, token counts, cost snapshots, model/plugin/purpose identifiers, outcomes, and error codes), never prompts, responses, or tool payloads.

## Collection boundaries

All plugin model calls flow through the host's model and execution boundaries (`src/plugins/models.ts`, `src/plugins/sdk/models.ts`, `src/plugins/sdk/execution.ts`, and `src/execution/core.ts`):

- **Automatic recording**: Every `models.stream`, `models.run`, and `execution.run` call is recorded at settlement, including failures, cancellations, long-context tier selection, and net prompt-cache savings calculated with `estimateUsageCost` and `estimateCacheSavings`. Recording errors are logged and never interrupt execution.
- **Plugin-declared purposes**: Plugins may declare localized `modelPurposes` in their `ModuleContribution` and pass an optional `purpose` identifier on `ModelRequestIdentity`. The host groups and displays purposes by `(pluginId, purposeId)` without interpreting paradigm-specific semantics; snapshot labels keep history readable if a plugin is later removed.
- **External metered usage**: Plugins can report non-model API usage (such as web search or media generation costs) through `plugin.telemetry.recordExternalUsage`.
- **Direct external calls**: Plugins that bypass host model services with direct network clients remain outside host telemetry, matching Asterism's networking boundary.

## Workspace enrichment

The host correlates telemetry events with live workspace metadata (`folders`, `sessions`, provider names, and loaded plugin metadata) at query time:

- **Projects are sidebar folders**: Project statistics group solely by host `folders`, keeping the host independent of plugin resource types such as directories.
- **Live updates with snapshot fallback**: Existing sessions reflect their current title and folder assignment when moved or renamed; deleted sessions and folders fall back cleanly to the snapshots recorded at event time.

## Querying and presentation

Queries run synchronously inside the runtime process via the `telemetry` service on the direct renderer transport (`src/shared/telemetry.ts`), using the renderer's local UTC offset for calendar, hourly, and weekday-by-hour bucketing.

The Dashboard (`src/renderer/features/dashboard/`) is a lazy-loaded primary view organized into five focused perspectives (Overview, Projects & Sessions, Models & Speed, Activity & Habits, Tools & Ecosystem) with shared time-range and multi-dimensional filters, live provider quota/runway integration, optional local monthly budget pacing, CSV/JSON export, and native non-modal Island drilldown.
