# Release automation and installed updates

Filed on 2026-09-17.

Packaging, fixed macOS signing, and a three-platform release pipeline have passed an initial end-to-end trial. Commit-driven prereleases and manual promotion are implemented. Their complete installed-update acceptance remains pending.

## Implemented

- [x] Platform installers and update metadata through electron-builder; electron-vite retains compilation.
- [x] Main-process update service, exit confirmation, runtime shutdown, and shared settings/titlebar state.
- [x] Fixed signing secrets and signature verification during the pipeline trial.
- [x] Weekly and manual release eligibility from main commits, shared version/notes computation, and an initial fixed target.
- [x] Promotion of an existing tested candidate, excluding later main changes and older same-target candidates.
- [x] Stable/prerelease selection with one application identity and separate development data.
- [x] Pure release-logic tests and typechecks.
- [x] Repository identity alignment. Trial releases were removed after confirmation that no users depended on them.

## Remaining acceptance

- [ ] Verify the first prerelease version and notes, then a manual promotion and its cumulative stable notes.
- [ ] Verify packaged PTY, search, and plugin-build helpers actually load and execute.
- [ ] Install a prerelease, configure a model, run a task, and reopen saved work.
- [ ] Update between two real installed versions. On macOS, use a user environment without the developer certificate installed; also accept Windows and Linux on real machines.
- [ ] Exercise titlebar download progress, ready/failure states, retry, settings navigation, cancelled exit, and confirmed restart installation.
- [ ] Disable prereleases, retain the installed version, and verify later higher stable versions continue normally.

Target platforms are macOS arm64, Windows x64, and Linux x64. Automated pipeline success does not establish every platform interaction. Publishing, remote configuration, and cleanup require their own explicit authorization.
