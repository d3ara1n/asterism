# Usage statistics

The host keeps a usage ledger of model requests, the tool calls those requests make, and plugin-reported metered usage. The ledger is paradigm-neutral: every plugin's model calls pass through host model services, so recording needs no plugin cooperation beyond optional labels.

## Storage and lifetime

The ledger is its own SQLite database beside the workspace database. It holds structured facts only: identifiers, token counts, timings, cost estimates, outcomes, error codes, and display-name snapshots. Prompts, responses, and tool payloads never enter it.

Usage history is permanent analytical record rather than workspace state. Records stay until the user deletes them by age or all at once; nothing expires automatically, and deleting or archiving sessions and folders leaves their usage in place. Recovery points do not include the ledger, so restoring workspace state never rewinds usage, but data preparation migrates its format together with other host storage. The format follows the same continuous n-to-n+1 migration rule as the workspace database.

## Recording

Model services record each request when it settles, including failures and cancellations; a request whose target never resolved reached no provider and is not usage. Execution requests also record every settled tool call, including calls inside scripts, keyed to the request that made them. A failed ledger write is logged and dropped; recording never changes the outcome of the work it observes.

Cost is estimated at recording time from the configured model prices, with per-category amounts and long-context tier selection, so later price edits do not rewrite history. Requests with unknown or partial pricing keep a status that the interface reports instead of counting unknown parts as zero.

Plugins label model calls by declaring purposes in their contribution and passing a purpose identifier with each request; the host groups by plugin and purpose without interpreting them. Plugins report non-model metered usage, such as web search fees, through the telemetry service. Plugins that call external services directly remain outside the ledger.

Each record snapshots the session title and folder, the provider name, and the purpose label at recording time. Reads prefer live workspace names and folder membership, so renaming or moving a session regroups its history; snapshots take over after deletion.

## Reading

The renderer reads through composable queries over one filter: totals with an optional comparison range, time series with optional grouping and a remainder group, breakdowns by dimension, weekday-by-hour matrices, timing distributions, request logs, tool-call groupings, and external usage. Aggregation runs in SQLite inside the runtime process; results carry identities, snapshots, and raw sums, and the renderer derives ratios, labels, and localized text. Time bucketing uses the caller's UTC offset; the shared calendar helpers and the SQL bucket expressions must agree on every key.

New records and deletions notify connected renderers through a throttled change event, and open views reread.

## Presentation

Usage opens as a sidebar page and is the root island of the main screen. Its panel cards share the object-card shell and sit directly on the window material. The view switch, range, filters, and page operations sit in the window titlebar's action area, as the workbench's object actions do, because they choose the source of everything below. Details of a model, folder, session, purpose, plugin, or day open as ordinary islands to the right, owned by the root; nested details open from within them. The page, its titlebar actions, and its detail islands share one view model for the application run, so details follow later range and filter changes and the chosen view survives navigation.

The monthly budget is a configuration value; it changes only the pace shown for the current calendar month.
