# Desktop build and platform acceptance

Filed on 2026-09-18.

The production desktop scaffold and macOS development path are implemented. Early Forge packaging and Monaco exploration are historical choices; current packaging uses electron-builder, and code presentation uses Pierre Diffs. MCP is integrated.

## Disposition

The user confirmed desktop build and platform acceptance on 2026-10-31. This plan is complete and archived. The confirmation covers the remaining platform scope below; exact build versions and machine details were not supplied. This is user acceptance, not a new automated test run.

## Recorded evidence

The user accepted source-plugin loading from a packaged application on 2026-10-13. macOS development and hot reload have been used in ordinary work. Real model connection tests were also accepted at that stage.

Cross-platform titlebar design received phase-level approval on 2026-10-18. That approval did not substitute for Windows or Linux real-machine checks.

The user has also accepted installed model setup, task execution, close/reopen persistence, packaged PTY commands, and packaged search on their own installation. Startup loading and failure presentation, including window controls and dragging, are accepted.

## Accepted platform scope

- [x] Verify Windows and Linux builds and installed application startup.
- [x] Verify runtime SQLite, native helpers, and module loading in the remaining target artifacts.
- [x] Exercise platform window controls, menu avoidance, system scaling, maximize/fullscreen transitions, and Linux native-titlebar mode.
- [x] Confirm close/reopen persistence and process cleanup on the remaining platforms.

New integrations require verification against the actual Electron/Node runtime and package format when they enter scope. Installed-update scenarios remain in `plans/todo-2026-09-17-release-ci.md`.

Build convenience must not introduce general Node or arbitrary IPC access into the renderer. Static checks and package inspection support acceptance; user interaction establishes GUI behavior.
