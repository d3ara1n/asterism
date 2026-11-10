# Agent-operated browser resources

Filed: 2026-11-10
Status: Deferred. Product scope recorded; implementation and GUI acceptance have not started.

## Purpose

Add a live browser page as a resource that an agent can create, observe, and operate, with the user able to intervene in the same page. This is an agent work object, not a general-purpose browser or a replacement for the system browser or Asterism's existing link-opening behavior.

The resource uses Electron's Chromium engine. It does not embed a separate Browser Use agent or introduce another agent loop. Desktop computer use is outside scope.

## Confirmed use cases

- An agent creates a Terminal, runs `npm run dev`, obtains the server URL from terminal output, creates a Browser resource, navigates to an address such as `http://localhost:3456`, and inspects the result. It can edit source, observe hot updates, scroll the real page, and capture further screenshots.
- An agent opens a relevant site or example and guides the user through it by navigating, scrolling, and interacting with the page while explaining the visible content. This does not make Browser the default destination for ordinary links.

Terminal and Browser remain independent resources. Passing a URL between operations does not require a dedicated development-server relationship or lifecycle controller.

## Confirmed interaction model

### A shared live page

Each Browser resource represents one page, analogous to a browser tab. The user and agent operate the same instance, not a visible copy of a hidden automation session.

The page appears inside the resource view and can be opened in an island. Its actual viewport follows the current display area's size. Resizing the view or moving it into an island changes the viewport and triggers normal responsive layout. This change is the intended result of the interaction, not a degradation to hide with a fixed internal viewport or scaled preview.

Users can navigate, scroll, type, and resize while an agent works. These actions legitimately change current state. The design does not require exclusive agent control, stale-observation guards, revision conflicts, or automatic reconciliation of human intervention. Further observation and human-agent communication are part of the interaction model.

Moving the page between display locations preserves its live browsing instance rather than reopening the URL in a second page.

### Explicit creation and derived pages

- Users can create Browser resources explicitly.
- Agent creation creates a resource and links it to the creating agent through the normal resource creation path.
- A user action inside a Browser page that opens another page, including `window.open` or a new-window link, creates a second Browser resource without automatically linking it to an agent.
- An agent action that opens another page creates a second Browser resource and links it to the agent responsible for that action.
- Links in agent Markdown continue to open in the system browser. Ordinary link opening elsewhere in the application does not implicitly create Browser resources.

Sharing a website session does not grant an agent access to other Browser resources. Resource identity and links continue to determine access, captured at request boundaries.

### Shared website data

Browser resources share one dedicated persistent Electron Session, like tabs sharing a browser profile. This session is separate from the application's own UI session.

Chromium owns cookies, Local Storage, IndexedDB, HTTP cache, Cache Storage, and Service Workers under their normal web semantics. Browser resources do not serialize copies of those databases into resource state. Persistent storage preserves data according to its own lifetime; it does not promise permanent website login or complete restoration of transient page state.

Shared website data is needed for testing websites and maintaining ordinary application state. Password management, autofill, browser-account synchronization, profile import, and a multi-profile product are outside scope.

## Initial capability scope

- Explicit resource creation and live embedded display.
- Navigation, back, forward, and reload.
- Observation of current URL, title, loading state, and viewport dimensions through the resource's ordinary state and inspection surfaces.
- Current-viewport screenshots.
- Page interaction sufficient for navigation, text entry, key input, scrolling, and the controls used by the confirmed tasks. Determine precise targeting and page-structure observation contracts during implementation.
- Website-data persistence through the shared Chromium session.
- File upload and download, with relevant controls and status in an auxiliary panel.
- Derived-page creation with the approved actor-dependent linking behavior.

Full-page screenshots are not a substitute for real scrolling. They do not reliably exercise scroll-triggered animation, lazy loading, sticky scenes, or JavaScript state updates along the page. The required observation path is actual scrolling followed by viewport capture after the page has had an opportunity to render. A continuously animated page does not need a universal "all animations finished" condition.

## Uploads, downloads, and website permissions

Downloads can use Electron's download events and DownloadItem state. Uploads need normal user file selection and an agent operation for supplying files to a page input. Reuse existing file/content services where their contracts fit.

The auxiliary panel should support the necessary file operations without becoming a general browser manager. Download progress is available from Electron; universal upload progress is not, because websites implement uploads through different mechanisms. Do not make generic upload-progress reporting an acceptance requirement.

Cookies and normal website storage do not require a custom permission-prompt product. Camera, microphone, location, notifications, clipboard, and device access do require explicit host behavior. The supported subset and grant/deny interaction remain undecided. This record does not approve blanket permission grants, a blanket denial policy, or a full website-permissions settings center.

## Implementation boundaries to investigate

- Keep resource state, creation, tools, views, and model-facing text in the owning plugin. Keep platform-native browser hosting and any required SDK capability generic; the host and SDK must not import builtin browser behavior.
- Evaluate WebContentsView as the native page host. Verify placement, clipping, stacking, focus, input, and movement between resource views and islands against the actual UI layout. Native views are not ordinary DOM elements.
- Define the host/runtime connection needed to control and observe the same WebContents. Avoid turning this concrete feature into a speculative general automation framework.
- Keep remote pages sandboxed and isolated from application preload capabilities and privileged IPC. Preserve normal web security rather than disabling it to make pages work.
- Fit the shared persistent session into the application's centralized Chromium data layout. The current application already sets a Chromium session-data root and has a permission policy for its own default session; website sessions need their own explicit handling.
- Preserve current external-link behavior for the application UI while handling derived pages within Browser resources.
- Use existing screenshot/content and history mechanisms where applicable. Website data and live page state remain distinct from captured tool-result content.

Electron provides the browser engine and storage primitives, not a complete browser shell. These integration points still need implementation. New dependencies, public protocols, storage formats, and additional interaction behavior require their normal decisions before adoption.

## Decisions still required

- Website permission support and its minimal user interaction.
- Page lifetime when a resource view is hidden or unmounted, the session changes, a resource is detached or removed, or the application restarts. Define what is persisted and what is recreated without implying restoration of a live JS heap or navigation history.
- Screenshot and observation behavior when no page surface is visible, including the viewport and Chromium rendering/throttling behavior.
- The creation/linking contract for derived pages, including attribution of delayed or script-initiated popups. Chromium's user-gesture flag alone does not distinguish a human click from an agent-simulated click. Resolve this through a concrete actor-attribution contract, not speculative concurrency machinery.
- Whether a derived page remains in the same work session and how it is presented using the existing resource UI.
- Upload file addressing, download destination selection, auxiliary-panel behavior, and transfer lifetime.
- Shared website-data cleanup and how it differs from removing one page resource.
- Minimal handling of page dialogs, external protocols, and navigation failures required by the confirmed tasks.

## Explicit exclusions

- Desktop screenshots, OS mouse/keyboard control, and native application automation.
- A Browser Use service or separate browser-agent orchestration loop.
- OAuth integration, system-browser login handoff, or guarantees that identity providers accept embedded Chromium. A website's ordinary cookie-based login can still work; broad authentication compatibility is not a delivery requirement.
- Intercepting agent Markdown links or general application browsing to create resources.
- Bookmarks, a general history manager, password filling, extensions, account sync, Chrome-profile import, and other general-browser features.
- Claims of complete Chrome compatibility, including DRM, specialized device access, and authentication mechanisms not required by the confirmed tasks.

## Deferred implementation and acceptance

- [ ] Inspect existing plugin, resource creation, native hosting, island, file, and content contracts; present the implementation scope and unresolved product decisions before coding.
- [ ] Resolve the decisions needed for the first implementation without expanding the product into a general browser.
- [ ] Implement the shared website session, per-resource live pages, embedded display, and viewport-following resize behavior.
- [ ] Implement the approved observation, interaction, creation, and derived-page contracts.
- [ ] Add the required upload/download panel behavior and approved website permission handling.
- [ ] Update concise model-facing usage guidance and bilingual application copy.
- [ ] Run appropriate typechecks and builds. Add focused tests only for meaningful pure logic and owning-boundary contracts, such as actor-attribution rules if they contain substantive branching; do not add UI/process/timing tests or assertions that merely repeat Electron behavior.
- [ ] Obtain user GUI acceptance: local development and hot updates; real scrolling and animation observation; resizing and island movement; user intervention in the same page; shared website state; actor-dependent derived-page links; uploads and downloads.

GUI acceptance remains manual. Implementation does not authorize automatic launch-wait-kill smoke cycles, real-data cleanup, or a commit.
