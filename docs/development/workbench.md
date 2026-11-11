# Workbench interaction and state

The workbench presents objects and their execution while keeping frontend state separate from backend work and persistence.

## Home, navigation, and settings

Startup opens Home without automatically loading an existing session. Once folders exist, the sidebar arranges session summaries in one of two views. The folder view groups them by folder: named folders in stable name order, each collapsible and showing its color, then sessions without a folder. The recent view lists every session in one flat list and marks each member with its folder's color dot, whose name is available on hover and to assistive technology. Without any folder the list is flat and the view switch is absent. Session order, in both the flat list and each group, follows the session catalog: newest created first, so opening or using a session does not move it. The chosen view and collapsed groups persist across restarts as incidental UI state. Selecting a session loads its workbench. Home hosts a plugin-provided entry interface; that plugin owns the interaction, business validation, and assembly of a new session with its initial title. The host imposes no initial-message or Agent-resource requirement.

Home keeps a folder selection for the next started session. The host supplies the folder control and its selection to the entry, which places the control in its own interface and passes the selection to session creation. Template cards tint their preview with the folder color of the folder that receives their sessions and name that folder in their caption.

The sole entry is displayed directly. With several entries, General settings holds the user's choice. An unavailable selection requires a new choice rather than silent replacement. Without an entry, Home explains that an Agent paradigm plugin is required. Host template access remains independent of entry availability.

Builtin's entry owns Agent/model controls and setup guidance for its configuration. Its composer and conversations support text and file input, including file-only messages. Attachments remain input parts rather than implicit resource cards. Draft attachments retain names and media types; previews load on demand. Other plugins can provide directory selection, forms, terminals, or other entry interactions.

Settings home contains application pages and plugin-declared configuration-page entries with contributor attribution. Roles, for example, opens builtin's configuration page and identifies builtin as its source. Plugins can declare several pages or none.

A normal Plugins card opens a plain management list with plugin information and enablement controls. There is no separate plugin list beneath the settings home and no plugin-card route to configuration pages. Plugin management remains available when a plugin has no configuration page or fails to load.

About owns version, update state, channel selection, and log access. The titlebar update indicator consumes the same state. General settings owns automatic-sleep and recycle-bin retention preferences and the recycle-bin entry. Sleeping sessions remain in the sidebar, dimmed with a moon icon; opening one renews user attention before its resources attach. Keep-awake is a per-session menu setting that prevents automatic sleep only.

## Startup and failure presentation

The startup view reports actual preparation and loading phases, using saved preferences only after host storage becomes available. Data-preparation failure opens recovery UI; ordinary startup failure exposes diagnostics, logs, and restart.

Window controls and dragging remain usable. The main process handles failures that prevent the renderer or bridge from presenting its own recovery.

Runtime readiness and frontend plugin preparation precede mounting Home. Loading feedback is delayed to avoid a flash on fast startup.

## State and feedback ownership

The session controller owns connection state and view-read failures. Individual commands, forms, and buttons own their pending and error state. Ordinary writes do not mark the whole workbench unavailable.

Initial reads can show a loading state. Updates retain existing content and component identity. A failed reread labels retained content as old; missing initial content uses an empty failure view. A stopped runtime requires restart rather than a misleading reread action.

Current values follow backend processing order. Subscriptions establish change observation before reading. Commands return independently of view synchronization.

View subscriptions and projections follow session visibility. User-created drafts and selected per-item view state follow object presence in frontend memory. Leaving the current projection releases retained object state. Restart does not restore those memory-only values.

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

## Auxiliary panels and object islands

Card panels show supplemental object information within the same card width. Wide cards split body and panel; narrow cards overlay the body. Opening a panel preserves the body mount, and only the selected panel is mounted.

The card shell owns panel focus, switching, closing, and Escape handling. Independent popovers handle Escape first. Closing restores the opening control when available.

Opening an object in an island moves its content out of the canvas card into an ordinary island. Each object has at most one island: while it is open, the card shows a placeholder with a return control and no open control, so the content mounts once. Several objects can be open side by side. Moving content between card and island may remount it but preserves object-retained state and backend work.

## Islands

The main page places the session navigation sidebar, the central Island viewport, and an optional auxiliary panel side by side. The sidebar and auxiliary panel stay docked within the page while visible. They reserve width rather than overlaying content, and users explicitly hide or close them to return that width to the central viewport. Island overflow and focus following move only the central working surfaces, never the sidebars.

Space switches the whole main page and settings as units. The main page remains mounted and inert while settings are active, retaining sidebar visibility, its auxiliary panel, and the Island arrangement. Switching sessions or returning Home closes the auxiliary panel after the current Islands accept navigation through their close guards.

Screen coordinates the central root and ordinary Islands. In a session, the canvas is the root: it is always first and cannot close. Auxiliary panels share panel presentation with Island content but do not participate in Island ownership, arrangement, or focus following.

Islands separate closing from cancelling an operation. Escape invokes a cancellation action only when the focused island explicitly declares one; it never closes a functional island merely because that island can close. A cancellation action owns its outcome and uses the normal close guards if it closes the island. Settings declares cancellation to return from a category to the overview, then from the overview to the main screen.

Ordinary islands behave like windows. A new island opens at the right end. Each live island has a stable host-owned instance identity and a content lookup key unique within its screen. Plugin keys are isolated by plugin identity. Opening an already bound key locates that instance without replacing its content or transferring ownership. Instance identity governs component lifetime, focus, arrangement, guards, cancellation, ownership, and targeted cleanup; a lookup key identifies the content to locate.

An editor can bind its existing instance to a different content key without remounting, changing arrangement, or closing its children. A new entry keeps a creation key until saving establishes its stored identity, then binds the saved-object key in place. Editable object identities use the same transition after a successful rename. The old key becomes available for another creation. An occupied key rejects the binding without changing either instance; successful persistence remains successful even when a later binding fails. Binding changes lookup, not the represented resource location or its restoration destination.

Each island records the instance that opened it. Closing an island also closes the islands it opened, transitively, regardless of where the user has moved them; position never implies a relationship. Page regions track the instances they created, so rebinding or reusing a key does not transfer cleanup ownership. The island menu in each island's chrome swaps it with its left or right neighbor and sets its size. Without a chosen size an island shares the screen; a size preset holds regardless of the window and may make the strip scroll horizontally, following the focused island.

The arrangement of restorable islands, with order, owners, and sizes, is session layout state saved beside card views and the canvas viewport and outside history. Restorable islands are object islands and resource locations opened through resource navigation; other islands exist only while open. Switching sessions closes the current session's islands through their guards, and opening a session or restarting restores its arrangement. Restoration creates fresh live instances, reconstructs lookup keys from the saved views, and maps saved ownership references to the surviving instances. A currently open instance wins a duplicate content key without losing its content or arrangement. Islands whose object or resource leaves the current projection close without consulting guards, together with the islands they opened, and the projection omits them.

Templates capture only the object islands of selected objects, in their current left-to-right order and with their chosen widths. New sessions restore those islands against newly created object identities. Resource-location islands and temporary panels remain outside template state; templates without a saved object-island layout open no islands.

## Content expansion

Resource views can open content in an island from a canvas card or an object island. Expansion leaves the source in place. The new island belongs to the island containing its source and opens at the right end of the screen.

The host owns containment, placement, focus restoration, and close coordination. Plugins own the content and its operations. Expanded content has its own mounted region and receives explicit domain inputs; closing or remounting its source card does not discard its editing state. Resource-bound operations still require the resource to be available.

Resource location opening is a common frontend capability. The host resolves current resource presence and delegates an opaque location to the resource's registered open handler. User and plugin navigation have no model-request authorization filter. Removed resources produce a missing-resource notice. The target plugin owns location interpretation, operations, and expanded views; cross-plugin opens retain the target's island identity and plugin region.

Island content is frontend state outside history. Unsaved panels confirm discarding edits on closure, closure through the island that opened them, session navigation, application exit, and window reload. Saving remains an explicit content operation; a failed save retains the draft.

The directory plugin dispatches file content to independent text and image surfaces. The host does not interpret file formats. The text editor reads current text and saves to the actual file. Its buffer belongs to the island, and later backend-processed writes win. Editing does not reinterpret or update earlier tool results. Git gutter marks compare the current buffer with a captured HEAD baseline; they do not add repository management operations.

Directory browsing and change review are plugin-owned views of current external state. Files loads directory contents on expansion; Changes builds parent groups from Git status paths and treats Git's untracked-directory summaries as terminal entries. Selected diffs compare current content against HEAD and remain separate from editor buffers and recorded tool results.

Directory observation belongs to mounted views, not resource attachment or background Agent execution. Shared view consumers acquire one object channel; releasing the last consumer closes native subscriptions and cancels pending browser reads. Retained UI state preserves view intent without retaining background observation or full loaded directory/status data. Reopening starts a fresh observation and read. Filesystem notifications invalidate state rather than establish Git status or record an operation history.

## Links and workbench panels

Drag from a resource to a link-capable receiver to establish a directed link. Direction follows resource semantics, not card position. Two opposite links can render as one double-arrow edge while retaining separate stored relations.

Link reception is declared only by the resource's backend implementation. The host projects that capability with each workbench object, and canvas endpoints, connection validation, and the authorization panel consume it. Renderer resource descriptions own presentation metadata. An unavailable backend cannot receive new links. Link capability is current runtime metadata and is not stored in session history.

The object panel offers a flat searchable object list, locating and visibility. The authorization panel edits actual directed links and explains request-boundary effects without inventing per-link pending status.

The history panel lists individual records in actual append order. Source filters use record provenance. Branch tabs organize continuations and shared positions.

The complete metadata tree remains navigable while visible history rows read their bodies on demand. Plugin record renderers own labels and row content. Search reads every candidate in the selected branch and source scope in batches, reports progress and failure, and retains matching identities rather than the scanned bodies. An unloaded or failed row is distinct from an unreadable stored record.

Selecting a history item or tab changes only a candidate. Explicit continuation, confirmation, and settled-state checks precede a cursor change. The workbench has no separate historical preview cursor.

## Agent conversation

Messages use structured sender data to distinguish user input, incoming Agent messages, and resource events. Incoming messages identify their source; event messages use a shared event icon and blue surface. All sources share body rendering. Model communication envelopes remain implementation data.

The conversation is virtualized and reads a window of recent records. Earlier messages load in batches within the retained reading boundary. A partially visible turn can read its earlier records for complete footer measurements without displaying those messages. Item identity remains stable through streaming, persistence, and scroll remounts. Live output and the tail remain mounted where required. Text selection and browser find cover mounted content.

The virtual list owns measurement, scroll compensation, and item positioning. Following output stops on deliberate reading gestures or navigation and resumes at the end. The conversation outline treats each input as a chapter: it locates the reader from virtualizer measurements, surfaces the current input once it scrolls out of view, and navigates by input position without moving the execution cursor.

Markdown uses shared rendering for history and live output. Code preserves copyable source; math uses KaTeX; Mermaid renders completed source and retains source on failure. Streaming animation drains and then yields to static rendering.

Markdown footnotes navigate within their containing Markdown surface, with document-local anchor identities and return links. During generation, parsing operates on individual blocks; cross-block footnotes resolve when the response settles into whole-document rendering. External web destinations open in the browser. Resource destinations carry an instance ID and an opaque location and use the same resource opening capability as resource views. File contents retain their own viewer contract rather than inheriting the Agent interface's link behavior.

Composer controls follow the Agent’s execution state: stop while running, continue for incomplete work, and ordinary send otherwise. Configuration changes apply to the next request.

## Drafts and conversation presentation

Agent drafts preserve complete text, stored files, file references, sender, and delivery mode. Their preview never replaces the stored input. File references display descriptive metadata without fetching content. Mode changes and reorder operations act by identity and follow backend order.

Taking a draft into an empty composer removes it from drafts. Swapping with composer content places that content in the old slot as a retained user draft. Taking an incoming Agent or event message into the composer makes subsequent submission user input. Stored-file content leases transfer before replacing the visible composer value; file references copy as data.

Lost receipts retain the submission identity and content needed for retry. Explicit failure preserves the original content. Restoration does not send drafts automatically.

One object-retained input owner admits operations that submit or replace composer content, derives the editor lock, and publishes operation and exchange-recovery state explicitly. Draft content and upload state have their own notifications; an unchanged editor lock is not a signal for unrelated operation-state changes. View remounts preserve both input content and a pending exchange.

Process folding groups the conversation by input, independently of execution turns and their measurements. Consecutive inputs share a group; an input after model content starts the next group, including when delivered as a steer within the same execution turn. The running tail remains available for interaction. Earlier groups and a stopped tail fold their thinking, tools, and intermediate replies behind separate summaries, preserving each group's final reply. A group with nothing to hide has no summary. Inputs, compaction markers, execution feedback, and turn measurements stay visible.

Each conversation group's final reply is the complete body of its last response when that response completed normally. Failure does not promote an earlier intermediate reply into a final answer. Turn measurements and the turn's copy action retain the execution turn's scope.

Manual expansion preserves the summary’s reading position. Automatic collapse respects whether the view follows output or reads earlier content. Virtualized movement and disclosure animation have separate ownership.

## Compaction and diagnostics

Compaction shows an activity or recorded marker without changing original history. On a fresh frontend load, the latest retained boundary determines the initial conversation reading window. Later compaction does not discard already visible earlier material in that mounted session.

Diagnostics read saved requests and completion data. They do not reconstruct historical prompts from current configuration or start new requests.

Context capacity uses reported input tokens from the relevant request and its actual model. Text composition uses character counts from projection. These units are never converted into each other by assumption.

E2E output rate divides reported output by measured request duration. Aggregates divide eligible token totals by eligible duration totals rather than averaging rates. Missing timings, counts, or valid denominators remain unknown.

Reference costs derive from recorded request usage and current model prices. Account usage has separate provider observations and must not be presented as a response cost.

## Errors and question handling

Agent execution errors and warnings appear inline in the owning conversation at their actual occurrence position, including request preparation, sending, provider responses, encoding, parsing, persistence, compaction, and cancellation. Diagnostic origin identifies the failure source but does not choose its presentation. The same execution feedback is not repeated in a toast; when response termination metadata supplies a historical notice, it replaces the matching transient notice. Tool business failures remain in tool results.

Independent interface commands, such as copying, saving, or opening a file, use toast notifications for operation failures. Rejected input submissions and configuration or draft changes remain command feedback, distinct from failures during Agent execution; a rejected submission leaves the unsent input in the editor. Field validation stays with its field. Feedback placement follows the operation it belongs to, not whether its underlying cause is local software or a remote service.

The Agent command list owns search and navigation; its command features report operation outcomes through toasts rather than an inline feedback area. A launched Agent task reports subsequent progress and execution failures in the conversation.

Transient inline feedback survives view remount within its resource lifetime but does not enter history, model context, or usage totals. Original error details remain inspectable and copyable.

Structured questions appear in the tool’s execution body. Optional enlargement shares the same draft; closing it neither answers nor cancels. Required answers validate on submission, and optional skips remain explicit.

Question drafts are scoped by session, Agent, and waiting instance. Repeated submissions remain disabled while pending. Runtime answers or cancellation conclude the tool; view lifetime alone does not.

## Tool views and Agent extensions

Input, execution, and result use one call shell. Resource-call rendering delegates to the selected implementation rather than nesting another shell. Partial arguments support preview only.

Streaming disclosure begins when previewable content exists and follows the saved preference and manual interaction. Attention opens an execution body once immediately; it remains user-collapsible afterward. Result details appear only after termination.

Built-in views retain target and input identity across phases. Display truncation is separate from saved result truncation. Current limits and component arrangements belong to the renderer source.

Agent toolbar items, overlays, and modals use public built-in domain extensions. Contributions retain registration order. Active hide-composer requests combine with logical OR and hide the whole composer, including stop and toolbar controls.

Plugin services own the business waiting state. Component unmount releases its view request without automatically cancelling the tool. The host does not impose an occupancy timeout or force-unlock trusted plugin UI.
