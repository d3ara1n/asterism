# Embedding a live browser in an Electron workbench

Reference filed 2026-11-18 after a failed GUI prototype in Asterism on macOS, using Electron 45.1.0 and a React Flow canvas. The [archived task](archived/todo-2026-11-10-browser-resource.md) records the original product scope and disposition. This reference is not a proposal to add a Browser resource.

## The constraint that mattered

The prototype tested a live Chromium page that both the user and Agent could control. The page was meant to behave like card content: it would pan, scale, clip, and stack with the card, and move into an island without losing in-page state. Two operations need different semantics:

- **Zoom the workbench:** visually scale the card and its webpage together without changing the webpage's layout viewport.
- **Resize the card or move the page into a differently sized island:** resize the layout viewport so the site reflows normally.

Keeping one live page instance across different renderer mounts is a separate requirement from making it compose like DOM. Sharing cookies or reopening the same URL does not preserve focus, scroll position, unsaved input, or the page's JavaScript state.

## What the prototype established

- **Observed:** A real `https://google.com` page loaded and was visible at some canvas zooms, but the page area became blank at others. The user also observed that canvas zoom did not visually scale the page with the card. The prototype was rejected on that experience, not because the URL failed to load.
- **Implementation and likely explanation:** The main process owned one `WebContentsView`. Renderer slots for the card and island reported screen-space geometry; the host moved and resized the same native view. Sending the transformed screen rectangle as bounds resized the Chromium viewport instead of scaling the composited page. The native surface did not inherit DOM stacking, clipping, or hit testing, so the prototype used a native clip container and hid the entire page on detected DOM overlap. A single near-edge hit-test miss could hide it; rounded corners and fractional transforms can cause such a miss. Moving probes inward attempted to reduce false positives, but did not change the composition model or establish a successful GUI fix.
- **Not accepted:** Tooling, instance reuse, site-session persistence, and the background lifetime were wired in the prototype, but the full card-to-island state-preservation and Agent-input walkthrough was not accepted. Typechecks and builds did not validate the visual behavior. No equivalent GUI result was established on Windows or Linux.

## Alternatives and prior art

| Approach | Useful for | What it does not solve |
| --- | --- | --- |
| [`WebContentsView`](https://www.electronjs.org/docs/latest/api/web-contents-view) | A full Chromium page in a fixed panel, tab, or secondary window. Main-process ownership can keep a page independent of a React mount. | It is not a DOM element. A browser shell or rectangle-sync wrapper does not give it React Flow transforms, DOM clipping, or CSS stacking. Matching bounds or calling page zoom is not the same as visually scaling a fixed layout viewport. |
| [Electron `<webview>`](https://www.electronjs.org/docs/latest/api/webview-tag) | Browser content attached to a DOM element, the closest fit for ordinary card transforms and layering. | Electron discourages using the tag and does not guarantee its future availability. In [Electron 45.1.0](https://github.com/electron/electron/blob/v45.1.0/lib/renderer/web-view/web-view-element.ts), detaching the element runs its reset path. Asterism's object view unmounts in the card and mounts in the island; preserving the live guest would need separate validation. Do not infer that a React wrapper or a DOM move API preserves it. This option was researched, not prototyped in the workbench. |
| [`iframe`](https://www.electronjs.org/docs/latest/tutorial/web-embeds#iframes) | DOM-native preview of a local or otherwise cooperating page. | Sites can refuse framing through `frame-ancestors` or `X-Frame-Options`. Same-origin policy limits inspection and control from the embedding page. It is not a general browsing or cross-site automation substitute. |
| [Electron offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering) | Compositing a live page into a canvas or another drawable surface while ownership stays outside the DOM. | Frames are not a ready-made browser control. Input routing, focus, IME, selection, accessibility, and performance become application responsibilities. Shared GPU textures also require native integration. Not prototyped. |

The wrappers reviewed did not close the gap. [`react-electron-web-view`](https://github.com/MarshallOfSound/react-electron-web-view) and [`@luxbit/react-electron-webview`](https://github.com/Luxbit/react-electron-webview) adapt the same `<webview>` tag to React. [`electron-tabs`](https://github.com/brrd/electron-tabs) provides tab UI and is marked discontinued. [`react-electron-browser-view`](https://www.npmjs.com/package/react-electron-browser-view) wraps the deprecated native `BrowserView` API, not a DOM browser surface. No suitable maintained drop-in was found in this survey; these are not claims about packages published later.

[VS Code's integrated browser](https://code.visualstudio.com/docs/debugtest/integrated-browser) uses [native `WebContentsView` instances](https://github.com/microsoft/vscode/blob/main/src/vs/platform/browserView/electron-main/browserView.ts) presented in editor tabs. [Cursor's browser documentation](https://cursor.com/docs/agent/browser) describes an inline pane or separate window; it does not establish how Cursor implements the surface. Both are precedents for an integrated browser in a bounded surface, not for a live page that participates in a zoomable canvas.

## If a concrete need returns

- **Shared browsing or Agent-assisted web testing:** try a fixed panel or tab before putting a live page on the canvas. Verify the native surface in that layout before adding an address bar, tools, or a new SDK capability.
- **Preview of a development page:** consider a DOM iframe for an origin under the user's control if normal framing policy permits it. Treat this as preview, not generic browsing.
- **A first-class browser card is essential:** prove the presentation with one narrow prototype before integrating the runtime. Test canvas zoom without page reflow, card resize with reflow, clipping at canvas edges, menu and overlapping-card stacking, normal focus and typing, and moving to and from an island without losing an unsubmitted form. Stop if those require another native overlay with broad hide heuristics. Check `<webview>` support against the actual Electron version in use then.

Lifecycle decisions can be reused independently of display technology. If a future feature needs a live instance, the resource should own it and the renderer should only display it. A concealed card or a switch to a different session need not close the instance. The existing Terminal implementation already publishes an open-instance activity through `ResourceActivity`; an idle open resource should not occupy timeline `busy`. Keep website data in a dedicated Chromium session, remote content isolated from the app preload and privileged IPC, and normal web security intact. The archived scope used Electron only and did not introduce Playwright.
