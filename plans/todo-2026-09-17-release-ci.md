# Release automation and installed updates

Filed on 2026-09-17.

Packaging, fixed macOS signing, and a three-platform release pipeline have passed an initial end-to-end trial. Commit-driven prereleases and manual promotion are implemented. One installed prerelease update has been accepted; platform-specific and stable-release acceptance remains pending.

## Implemented

- [x] Platform installers and update metadata through electron-builder; electron-vite retains compilation.
- [x] Main-process update service, exit confirmation, runtime shutdown, and shared settings/titlebar state.
- [x] Fixed signing secrets and signature verification during the pipeline trial.
- [x] Weekly and manual release eligibility from main commits, shared version/notes computation, and an initial fixed target.
- [x] Promotion of an existing tested candidate, excluding later main changes and older same-target candidates.
- [x] Stable/prerelease selection with one application identity and separate development data.
- [x] Pure release-logic tests and typechecks.
- [x] Repository identity alignment. Trial releases were removed after confirmation that no users depended on them.

## Accepted

- [x] Update between real installed prereleases: `v0.1.0-prerelease.1` → `v1.0.0-prerelease.1` downloaded, replaced on restart, and started. This establishes the successful restart-installation path, not retention of data across a format change or all update UI states.
- [x] Install a prerelease, configure a model, run a task, and reopen saved work.
- [x] Execute packaged PTY commands and filesystem searches.
- [x] Accept titlebar download progress, the ready state, and navigation to update settings.
- [x] Cancel exit with an update ready and confirm the application remains usable.
- [x] Accept macOS fixed-self-signed update validation: the user completed an installed update, and inspection of the installed application's designated requirement confirms application-identifier and certificate-hash matching without client certificate import.

These additional checks were confirmed by the user on their own installation. Other-platform acceptance remains separate.

## Remaining acceptance

- [ ] Verify the generated prerelease version and release notes.
- [ ] Verify manual promotion of a tested candidate and its cumulative stable notes.
- [ ] Verify the packaged plugin-build helper with a current external source plugin. An earlier packaged source-plugin load was accepted on 2026-10-13.
- [ ] Verify installed updates on Windows and Linux real machines, recording each platform separately.
- [ ] Accept the update failure state and retry.
- [ ] Disable prereleases in an installed build and confirm the installed version is retained.
- [ ] Verify a later higher stable version is offered and installs normally after prereleases are disabled.

Candidate-selection fixtures cover prerelease-to-stable selection and avoiding downgrade when prereleases are disabled. They do not establish installed-update or GUI acceptance.

The inspected installed macOS application's designated requirement binds its application identifier and fixed self-signed root certificate hash. It does not require a client-installed trusted certificate. CI imports and trusts the signing identity for building; Gatekeeper first-launch acceptance is separate from update signature continuity.

Target platforms are macOS arm64, Windows x64, and Linux x64. Automated pipeline success does not establish every platform interaction. Publishing, remote configuration, and cleanup require their own explicit authorization.
