# Windows application replacement after the ASAR payload change

The user tested `v1.0.1-prerelease.1` on Windows on 2026-11-20. Plugins and the in-app installer flow worked, and installation was substantially faster. The remaining visible phases were old-version removal, then extraction and copying. This is user acceptance of that preview, not an installation benchmark.

## Current sequence

The pinned electron-builder install section invokes the registered old uninstaller before installing the new files. It uses `/S /KEEP_APP_DATA` and normally `--updated`. The update uninstaller can walk and move individual old application files to a temporary tree before removing them. Settings, sessions, and installed user plugins live outside the application directory. The 7z extractor unpacks the new tree in `$PLUGINSDIR/7z-out` and then copies the tree into `$INSTDIR`. These are separate pieces of disk work, regardless of where the visible progress bar resets.

## Choices

With `differentialPackage: false`, the pinned builder supports `nsis.useZip: true`. Its stock ZIP extractor writes directly to `$INSTDIR` and bypasses the second tree copy. The old uninstaller still runs first, the archive encoding changes, and the old application is not available if extraction later fails. This is a small change if the goal is only to skip the copy.

For the same-scope, same-path in-app update, use [the directory replacement pattern in DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/apps/desktop/scripts/installer-directories.nsh): extract once into a sibling on the destination volume, rename the existing directory aside, rename the staged version into place, then register the new installation and clean up the old tree. Do not invoke the old uninstaller on this path. Deletion of obsolete files still happens, but no old executable has to perform its pre-install per-file move and the expanded new tree is not copied. Keep the old version in place until extraction succeeds, and restore its name if the second rename fails. Two renames are not one atomic file system operation. This design temporarily requires space for both trees and needs to handle Windows directory locks by reporting actual failure. Asterism can keep its one visible progress page, regular manual setup, and explicit uninstall path. Scope and path changes are not the same operation as an in-app update.

Default electron-builder templates wire uninstall and extraction into the install section before the `customInstall` hook. Replacing both operations needs a narrowly owned installer section or template adaptation, not just another finish-page hook. No installer or update code was changed in this investigation.
