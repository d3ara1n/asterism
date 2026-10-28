# Workbench interaction and state

The workbench presents objects and their execution while keeping frontend state separate from backend work and persistence.

## Home, navigation, and settings

Startup opens Home without automatically loading an existing session. The sidebar lists session summaries. Selecting a session loads its workbench; accepting a first input creates the session, Agent, and input atomically.

Onboarding points to missing provider, model, or role configuration. It is guidance, not an independent request-validity check or stored completion flag.

Home and conversations support text and file input, including file-only messages. Attachments remain input parts rather than implicit resource cards. Draft attachments retain names and media types; previews load on demand.

Settings separates application categories from plugin cards. Plugin metadata and management remain available when a plugin has no settings page or fails to load. Internal navigation and ordinary card opening reach the same plugin settings page.

About owns version, update state, channel selection, and log access. The titlebar update indicator consumes the same state. General settings owns the session recycle-bin entry.

## Startup and failure presentation

The startup view reports actual preparation and loading phases, using saved preferences only after host storage becomes available. Data-preparation failure opens recovery UI; ordinary startup failure exposes diagnostics, logs, and restart.

Window controls and dragging remain usable. The main process handles failures that prevent the renderer or bridge from presenting its own recovery.

Runtime readiness and frontend plugin preparation precede mounting Home. Loading feedback is delayed to avoid a flash on fast startup.

## State and feedback ownership

The session controller owns connection state and view-read failures. Individual commands, forms, and buttons own their pending and error state. Ordinary writes do not mark the whole workbench unavailable.

Initial reads can show a loading state. Updates retain existing content and component identity. A failed reread labels retained content as old; missing initial content uses an empty failure view. A stopped runtime requires restart rather than a misleading reread action.

Current values follow backend processing order. Subscriptions establish change observation before reading. Commands return independently of view synchronization.

View subscriptions and projections follow session visibility. User-created drafts, focus identity, and selected per-item view state follow object presence in frontend memory. Leaving the current projection releases retained object state. Restart does not restore those memory-only values.

## Session notifications

The sidebar subscribes to title and resource-status events without loading conversations. Resource status is transient domain feedback, distinct from busy occupancy and Agent execution state.

Running state remains visible, with optional progress. Completed, failed, and awaiting notifications are consumed when the session is viewed. Clicking a status popup inspects it without navigating or consuming it.

Session row navigation, status access, and the action menu retain separate hit targets within one row. Renaming preserves the local edit draft while background titles change. Archiving confirms the effect on running resources.

## Canvas and cards

Every object uses `ObjectCard` and the shared `ObjectSurface`. Resource declarations supply default geometry. User size, position, visibility, folding, and viewport are view data outside history.

Card size presets are Small, Medium, and Large, with Medium using the resource's default geometry. Presets respect the resource's minimum dimensions and the workbench's maximum dimensions. Double-clicking the resize handle or choosing the menu's restore action clears the size override and restores the resource's current default geometry.

New cards find a nearby empty rectangle using actual card sizes. Model-created resources prefer the caller’s location; user creation prefers the viewport. Drop placement uses the drop point. Existing cards retain their position.

Arrange explicitly runs the layout engine over visible cards and links, preserves the graph center, and commits positions together. It retains size and other view choices. Streaming updates never trigger automatic full arrangement.

Locate reveals hidden cards when needed, waits for measurement, and frames their bounds. Content scroll belongs to content; canvas pan and zoom use the canvas’s gestures unless an actual nested interaction owns them.

Hiding is available through the object panel. Removing is a distinct confirmed object operation governed by busy state.

## Auxiliary panels and focus

Card panels show supplemental object information within the same card width. Wide cards split body and panel; narrow cards overlay the body. Opening a panel preserves the body mount, and only the selected panel is mounted.

The card shell owns panel focus, switching, closing, and Escape handling. Independent popovers handle Escape first. Closing restores the opening control when available.

Object focus moves content into a leading island beside the workbench. The canvas retains a placeholder card and its links. Only one object is focused per session. Focus changes presentation and may remount content, but preserves object-retained state and backend work.

## Links and workbench panels

Drag from a resource to a link-capable receiver to establish a directed link. Direction follows resource semantics, not card position. Two opposite links can render as one double-arrow edge while retaining separate stored relations.

Link reception is declared only by the resource's backend implementation. The host projects that capability with each workbench object, and canvas endpoints, connection validation, and the authorization panel consume it. Renderer resource descriptions own presentation metadata. An unavailable backend cannot receive new links. Link capability is current runtime metadata and is not stored in session history.

The object panel offers a flat searchable object list, locating and visibility. The authorization panel edits actual directed links and explains request-boundary effects without inventing per-link pending status.

The history panel lists individual records in actual append order. Source filters use record provenance. Branch tabs organize continuations and shared positions.

Selecting a history item or tab changes only a candidate. Explicit continuation, confirmation, and settled-state checks precede a cursor change. The workbench has no separate historical preview cursor.

## Agent conversation

Messages use structured sender data. User input and incoming Agent messages have distinct alignment and identifiers; model communication envelopes remain implementation data.

The conversation is virtualized. Item identity remains stable through streaming, persistence, and scroll remounts. Live output and the tail remain mounted where required. Text selection and browser find cover mounted content.

The virtual list owns measurement, scroll compensation, and item positioning. Following output stops on deliberate reading gestures or navigation and resumes at the end. The minimap scrolls by input position without moving the execution cursor.

Markdown uses shared rendering for history and live output. Code preserves copyable source; math uses KaTeX; Mermaid renders completed source and retains source on failure. Streaming animation drains and then yields to static rendering.

Composer controls follow the Agent’s execution state: stop while running, continue for incomplete work, and ordinary send otherwise. Configuration changes apply to the next request.

## Drafts and turn presentation

Agent drafts preserve complete text, files, sender, and delivery mode. Their preview never replaces the stored input. Mode changes and reorder operations act by identity and follow backend order.

Taking a draft into an empty composer removes it from drafts. Swapping with composer content places that content in the old slot as a retained user draft. Editing an incoming Agent message makes subsequent submission user input. Content leases transfer before replacing the visible composer value.

Lost receipts retain the submission identity and content needed for retry. Explicit failure preserves the original content. Restoration does not send drafts automatically.

During execution, process entries remain available for interaction. Once a turn settles, its thinking, tools, and intermediate replies fold behind a summary. Inputs, compaction markers, and execution feedback stay visible.

The final reply is the complete body of the last normally completed response. Failure does not promote an earlier intermediate reply into a final answer. Copy uses that same final-body definition.

Manual expansion preserves the summary’s reading position. Automatic collapse respects whether the view follows output or reads earlier content. Virtualized movement and disclosure animation have separate ownership.

## Compaction and diagnostics

Compaction shows an activity or recorded marker without changing original history. On a fresh frontend load, the latest retained boundary determines the initial conversation reading window. Later compaction does not discard already visible earlier material in that mounted session.

Diagnostics read saved requests and completion data. They do not reconstruct historical prompts from current configuration or start new requests.

Context capacity uses reported input tokens from the relevant request and its actual model. Text composition uses character counts from projection. These units are never converted into each other by assumption.

E2E output rate divides reported output by measured request duration. Aggregates divide eligible token totals by eligible duration totals rather than averaging rates. Missing timings, counts, or valid denominators remain unknown.

Reference costs derive from recorded request usage and current model prices. Account usage has separate provider observations and must not be presented as a response cost.

## Errors and question handling

Provider, transport, truncation, empty-response, budget, and stop feedback appears inline at its actual conversation position. Software encoding, parsing, and persistence faults use application notifications. Tool business failures remain in tool results.

Transient inline feedback survives view remount within its resource lifetime but does not enter history, model context, or usage totals. Original error details remain inspectable and copyable.

Structured questions appear in the tool’s execution body. Optional enlargement shares the same draft; closing it neither answers nor cancels. Required answers validate on submission, and optional skips remain explicit.

Question drafts are scoped by session, Agent, and waiting instance. Repeated submissions remain disabled while pending. Runtime answers or cancellation conclude the tool; view lifetime alone does not.

## Tool views and Agent extensions

Input, execution, and result use one call shell. Resource-call rendering delegates to the selected implementation rather than nesting another shell. Partial arguments support preview only.

Streaming disclosure begins when previewable content exists and follows the saved preference and manual interaction. Attention opens an execution body once immediately; it remains user-collapsible afterward. Result details appear only after termination.

Built-in views retain target and input identity across phases. Display truncation is separate from saved result truncation. Current limits and component arrangements belong to the renderer source.

Agent toolbar items, overlays, and modals use public built-in domain extensions. Contributions retain registration order. Active hide-composer requests combine with logical OR and hide the whole composer, including stop and toolbar controls.

Plugin services own the business waiting state. Component unmount releases its view request without automatically cancelling the tool. The host does not impose an occupancy timeout or force-unlock trusted plugin UI.
