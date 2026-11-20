# Progress-only Windows in-app updates

Source investigation on 2026-11-20 against Asterism v1.0.0, electron-builder 26.18.0, and electron-updater 6.8.11. Scope: installer interaction only; keep full downloads and the current package format. No production changes or Windows execution.

The running app already calls non-silent `quitAndInstall`, and `NsisUpdater.doInstall` passes `--updated`. The new version's NSIS executable owns the wizard, so the new Setup can improve the upgrade experience for installed v1.0.0 without a preparatory release.

A small `nsis.include` can keep the assisted installer for a manually started Setup and customize only the in-app update branch:

- Use the install-only `customInstallMode` hook in `multiUserUi.nsh`. When `isUpdated` and exactly one installation is registered, set the corresponding `$isForceCurrentInstall` or `$isForceMachineInstall` flag. The existing branches skip the scope page, use the registered path, and invoke UAC for machine scope when needed. The assisted template already skips the directory page on `isUpdated`. If neither or both scopes are registered, do not silently guess; machine-scope installation also invokes the old per-user uninstaller in the original template.
- Keep `MUI_PAGE_INSTFILES` and its normal progress reporting. Use `customFinishPage` to preserve the manual finish page and skip it in the update branch. Keep automatic closure on success (`SetAutoClose true`, already the standard MUI finish configuration) so skipping the finish page does not just leave a Close button on the progress page.
- Launch the installed app from NSIS [`.onInstSuccess`](https://nsis.sourceforge.io/Reference/.onInstSuccess) only in the update branch. Use the existing `StdUtils.ExecShellAsUser` pattern so a machine-scope upgrade does not relaunch Asterism elevated. Keep manual launch behavior and real installer errors unchanged. `--force-run` alone does not do this: `installSection.nsh` checks it together with `Silent` for assisted installers.

Source locations: `electron-builder.config.ts`, `src/main/updates.ts`, `electron-updater/out/NsisUpdater.js`, and `app-builder-lib/templates/nsis/{multiUserUi,assistedInstaller,installSection,common}.nsh`. This is a source-level implementation path, not a validated build.

## Disposition

Implemented in `scripts/windows/installer.nsh`, wired through `electron-builder.config.ts`. Typechecking, the focused updater tests, and plugin packaging tests passed. A fixture-based x64 NSIS installer compiled with the upstream NSIS 3.12 toolset on macOS; the Windows GUI upgrade and relaunch were not run.
