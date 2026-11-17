# Plugin system follow-up

Filed on 2026-10-12.

The SDK, package loader, shared public modules, typed creation/actions/calls/events, renderer contributions, top-level tools, and built-in public extensions are implemented.

## Recorded completion

The user accepted the core card, creation/action, first-input, stop/continue, history, and reopen path on 2026-10-13. Loading an external source plugin from a packaged application was also accepted.

The implementation separated read and execution facades, shared actual contract instances, parsed owner input once, supported explicit preparation replacement, and coordinated cancellation with real completion.

Built-in public packages and the initial question consumer later verified cross-plugin actions, top-level tools, and Agent UI extensions. More advanced interactions require their own evidence.

On 2026-11-17, explicit plugin artifacts and a standalone builder replaced startup source compilation. Managed npm acquisition, exact-version updates, script approval, cancellation, and recovery records are implemented. Process-backed checks include actual Electron Node-mode loading and an isolated registry; the new management UI and cross-platform operation still require manual acceptance. Earlier acceptance of source loading does not establish acceptance of the replacement artifact path.

The user subsequently confirmed the development builtin interface works after correcting CommonJS dependencies that required external React. This narrowly accepts recovery from that renderer import failure; it does not close local/npm installation or cross-platform acceptance.

## Settings acceptance

Plugin-owned settings pages and shared service scopes are implemented.

- [x] Accept settings sections, plugin cards, transitions, searching/filtering, and preserved navigation position.
- [ ] Accept enable/disable/removal and restart feedback.
- [ ] Accept the prebuilt local-directory path and npm installation/update/script-approval controls in the actual application.
- [x] Accept immediate built-in settings changes and restoring defaults.
- [ ] Accept external settings pages, internal navigation, and page-failure recovery.

## Deferred implementation

- [ ] Decide and implement optional cleanup of plugin-private data and credentials during removal, preserving session objects and history.
- [ ] Add provider-specific model-cache controls when actual support and consumers justify them. Existing diagnostics are not complete cache management.

Further domain extensions should use the established contribution and communication mechanisms. This task does not authorize a marketplace service or another parallel registration framework.
