# Usage statistics

The host keeps a usage ledger of model requests, the tool calls those requests make, the subjects that work declared it used, and plugin-reported metered usage. The ledger is paradigm-neutral: host model services record usage for every plugin without requiring plugins to register any purposes.

## Storage and lifetime

The ledger is its own SQLite database beside the workspace database. It holds structured facts only: identifiers, token counts, timings, cost estimates, outcomes, error codes, and display-name snapshots. Prompts, responses, and tool payloads never enter it. A declared subject contributes identifiers, such as a skill name and a package-relative file path, and an optional amount, not the content it names.

Usage history is permanent analytical record rather than workspace state. Records stay until the user deletes them by age or all at once; nothing expires automatically, and deleting or archiving sessions and folders leaves their usage in place. Recovery points do not include the ledger, so restoring workspace state never rewinds usage, but data preparation migrates its format together with other host storage. The format follows the same continuous n-to-n+1 migration rule as the workspace database.

## Recording

Model services record each request when it settles, including failures and cancellations; a request whose target never resolved reached no provider and is not usage. Execution requests also record every settled tool call, including calls inside scripts, keyed to the request that made them. A failed ledger write is logged and dropped; recording never changes the outcome of the work it observes.

Cost is estimated at recording time from the configured model prices, with per-category amounts and long-context tier selection, so later price edits do not rewrite history. Requests with unknown or partial pricing keep a status that the interface reports instead of counting unknown parts as zero.

Plugins can pass a purpose identifier with a model request. The host groups by plugin and purpose, displays the identifier verbatim like a tool name, and exports it as `purposeId`. The interface localizes its own labels, including the label for a missing purpose. Plugins report non-model metered usage, such as web search fees, through the telemetry service. Plugins that call external services directly remain outside the ledger.

Each model record snapshots the session title, folder, and provider name at recording time. Reads prefer live workspace names and folder membership, so renaming or moving a session regroups its history; snapshots take over after deletion.

## Declared subjects

A fact is recorded by the party that observes it. Requests and tool calls pass through host model services, so the host records them. What the work used is often known only to a plugin: which skill a tool tried to read or how large a prompt section was. Plugins declare these facts as usage subjects; the host attaches each declaration to the request or tool call that is current where it is declared and stamps the declaring plugin. A plugin cannot name another plugin, session, request, or call, so attribution stays correct even when the declared content is wrong.

There are two declaration scopes. A top-level tool declares through its call context while it runs; declarations after the call settles are dropped, and they are recorded with the settled call whatever its outcome. A model request declares through its request identity: static subjects with the request, or, for execution requests, a function evaluated once after the system prompt is prepared so the subjects can describe that prompt. Invalid subjects and failed declaration callbacks are logged and omitted without changing the operation result.

A subject has a kind, identity, optional source, relation, optional part, and an optional non-negative quantity. Kind and relation are open identifiers stored verbatim. Views choose the declaring plugin whose observations they interpret, independently of the plugin that requested the model call.

The builtin paradigm declares `skill` subjects with relation `read` after resolving the skill name to a catalog source, even if the file read later fails. A name that cannot be resolved appears only as a failed tool call. The Skills view combines those declarations with the actual tool outcomes: only successful reads appear in Skills metrics. Failures remain available in tool records. Agent and subagent requests declare the projected catalog as `skill-catalog` context, measured in Unicode code points. User references are not read attempts and do not enter these metrics.

Builtin declares a `work-unit` with each conversation or delegated request. It records the role ID, Agent or pool resource identity, and turn-start input or delegation run ID. Requests in one turn share a unit; the host does not scan history to infer it. Reports count distinct units within the session and resource scope, so two Agents with the same role count separately. Missing unit identity is unknown, not an inferred turn.

## Reading

The renderer reads through composable queries over one filter: totals with an optional comparison range, time series with optional grouping and a remainder group, breakdowns by dimension, weekday-by-hour matrices, timing distributions, request logs, tool-call groupings, external usage, and declared subjects of one kind per source and identity. The filter can select requests that declared a matching subject, which narrows every other query to them and excludes plugin-reported usage. Dimensions narrow independently: a model ID selects that ID from every provider that served it, and a provider narrows on its own. Aggregation runs in SQLite inside the runtime process; results carry identities, snapshots, and raw sums, and the renderer derives ratios, labels, and localized text. Time bucketing uses the caller's UTC offset; the shared calendar helpers and the SQL bucket expressions must agree on every key.

New records and deletions notify connected renderers through a throttled change event, and open views reread.

## Presentation

Usage opens as a sidebar page and is the root island of the main screen. Its panel cards share the object-card shell and sit directly on the window material. The view switch, range, filters, and page operations sit in the window titlebar's action area, as the workbench's object actions do, because they choose the source of everything below. Applied filters appear inside that control, so the page below holds only content and its scope is never off-screen. Details of a model, folder, session, purpose, plugin, skill, or day open as ordinary islands to the right, owned by the root; nested details open from within them. Model details keep the provider that served the requests, because prices, speed, and latency belong to the connection. The page, its titlebar actions, and its detail islands share one view model for the application run, so details follow later range and filter changes and the chosen view survives navigation.

The Skills view joins recorded reads with current catalog names to show skills without a successful read in the selected range. A name counts once across catalog sources, while details and settings are scoped to the selected source. Skill details count successful tool calls, not requests, in the trend and in rankings by file, session, model, and Agent role. As in the rest of usage, the time filter and trend buckets use the owning model request’s start. Counts and rankings keep older reads even when no turn was recorded. The catalog card shows average character size across filtered requests that carried it. Skill settings show the latest successful read and the number of sessions with successful reads in the last 30 days.

The monthly budget is a configuration value; it changes only the pace shown for the current calendar month.
