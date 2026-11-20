# Windows installer and update behavior

Investigated on 2026-11-20 against the published [Asterism v1.0.0](https://github.com/d3ara1n/asterism/releases/tag/v1.0.0), electron-builder 26.18.0, and electron-updater 6.8.11. The release archive was inspected on macOS; the installer was not run on Windows.

## Installer interaction

There is no single Electron Windows installer. [electron-builder's NSIS target](https://www.electron.build/docs/nsis) defaults to a one-click installer, with a current-user install by default. [Electron Forge's Squirrel.Windows maker](https://www.electronforge.io/config/makers/squirrel.windows) is also conventionally prompt-free and does not require admin privileges. [VS Code](https://code.visualstudio.com/docs/setup/windows) uses [Inno Setup](https://github.com/microsoft/vscode/blob/main/build/win32/code.iss), separates User and System Setup, and recommends User Setup for smoother background updates. Reusing the existing scope and destination is a design choice, not an Electron requirement.

Asterism builds an assisted installer (`oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`), so a manually opened Setup EXE offers scope and directory choices even when an older copy exists. In-app updates call `quitAndInstall(false, true)`; the installed `NsisUpdater` supplies `--updated` without `/S`. The pinned NSIS templates skip the directory page on `isUpdated` but do not skip the scope page on that flag alone. `initMultiUser` uses HKCU/HKLM to select the default scope when it finds exactly one installation. The scope page skips when forced by an explicit scope or other template conditions such as an elevated inner installer; detecting a previous install does not itself skip the page. The non-silent assisted template still has a finish page; `--force-run` does not bypass it. Commit `049141e0` switched away from silent mode after reporting roughly a minute without a window; that report is not a timing measurement of v1.0.0.

## Download and local installation costs

Windows updates download the whole Setup EXE on a cache miss: `disableDifferentialDownload: true` in `src/main/updates.ts`, `differentialPackage: false` in `electron-builder.config.ts`, and no blockmap upload in `.github/workflows/release.yml` (commit `944cf147`). A transfer delta would reduce download bytes, not change how NSIS applies the recreated installer locally.

| v1.0.0 x64 artifact measurement | Result |
| --- | ---: |
| Published `Asterism-win-x64.exe` | 171,862,514 bytes (163.9 MiB) |
| Embedded solid LZMA2 `app-64.7z` | 171,258,320 bytes |
| Expanded payload (archive listing, excluding directories) | 754.43 MiB across 28,558 files |
| `resources/app.asar.unpacked/node_modules` | 354.97 MiB across 27,823 files |

The pinned NSIS `installSection.nsh` runs the old uninstaller where present, preserving application data on update, then installs the entire new payload. `include/extractAppPackage.nsh` writes the embedded archive to the temp directory, expands it to a staging directory, and copies the staged files to the installation directory in the normal 7z path. File count, disk throughput, file-lock retries, and endpoint scanning can affect the wall-clock time; their relative contributions are not measured. The application also cleans up the workspace/runtime before launching the installer (`src/main/index.ts`), which is separate from installer progress.

## Candidate follow-up

Keep NSIS and separate the first-install wizard from the in-app update experience. On the normal in-app path, resolve the correct existing scope/path, keep progress visible, and relaunch on success without the finish page. Retain required UAC and real failure handling. Test per-user and all-users upgrades, custom paths, dual-scope installations, and manually opened Setup separately. Do not switch globally to one-click without checking the migration of installed copies.

On Windows, time download, app shutdown, installer start/old-version removal/extraction/copy, and new-app startup separately. Compare narrower unpacking and safe exclusion of non-runtime dependency artifacts first; preserve plugin loading and tools requiring real files outside ASAR. The pinned builder supports an experimental `useZip: true` comparison with `differentialPackage: false`: it changes extraction and transfer size, so measure both. Revisit transfer deltas separately with the actual GitHub release feed and supported upgrade paths.

The user confirmed that full downloads are fast enough and should remain in place. Local installation performance is deferred; no timing study is requested for the progress-only change.
