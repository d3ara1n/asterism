# Windows installation payload comparison

Investigated on 2026-11-20. Compared x64 release executables and their nested `app-64.7z` listings, not installation timings. No installer was executed. Download policy and the progress-only update path are out of scope.

| Release | Setup size (MiB) | Expanded payload (MiB) | Payload files | Archive layout |
| --- | ---: | ---: | ---: | --- |
| [Asterism 1.0.0](https://github.com/d3ara1n/asterism/releases/tag/v1.0.0) | 163.90 | 754.43 | 28,558 | Solid LZMA2/BCJ, 2 blocks |
| [OpenChamber 2.7.3](https://github.com/openchamber/openchamber/releases/tag/v2.7.3) | 150.04 | 549.80 | 1,918 | Non-solid LZMA2/LZMA/BCJ2, 1,916 blocks |
| [DeepSeek Harness 0.2.2-rc.5](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.5), official Windows download | 285.71 | 1,077.06 | 7,880 | Non-solid LZMA2/BCJ, 7,787 blocks |

All three inspected builds are Electron + NSIS. Counts exclude directories and count app.asar as one file. Harness additionally includes Python, standalone Node, pnpm and native helpers; the analyzed installer is the full official desktop EXE, not a third-party bootstrapper.

## OpenChamber: fewer filesystem entries

[The Electron package configuration](https://github.com/openchamber/openchamber/blob/v2.7.3/packages/electron/package.json) bundles the desktop entry points, stages a built OpenCode server and built web assets, excludes unnecessary dependency sources and other-platform helpers, and explicitly unpacks only selected helpers and bundled extensions in addition to auto-detected native files. Its `app.asar.unpacked/node_modules` has 86 files; most of the 1,918 files are staged web and server assets. [Its NSIS include](https://github.com/openchamber/openchamber/blob/v2.7.3/packages/electron/resources/installer.nsh) only adjusts DPI awareness. A bespoke installer is not necessary to get the file count down.

Asterism's `asarUnpack` matches all of `node_modules`: 27,823 disk files with 354.97 MiB, including 2,896 TypeScript declarations and 3,489 other TypeScript files. Examples by file count: es-toolkit (3,170), lucide-react (2,299), and lodash (1,050). Counts alone do not prove a file is unused. The plugin runtime and packaged dependency verifier currently assume physical paths in multiple places; distinguish dependencies needed by a real-path consumer from normal JS/data and keep public SDK declarations and intentional examples. Narrow packing should preserve pnpm executable/script handling, native modules, shared imports and bundled/public plugin loading.

## DeepSeek Harness: fewer files and no staged tree copy

[The desktop packaging notes](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/apps/desktop/packaging/README.md) describe preparing the production plugin/core dependency tree at build time and keeping it in `app.asar/dsh` except files needing real paths, with user-installed plugins outside the application. The artifact has 1,666 loose files under `app.asar.unpacked/dsh` and 6,136 files in the separate runtime resources.

[The installer](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/apps/desktop/scripts/installer-directories.nsh) runs its bundled 7-Zip extractor into a sibling staging directory, renames the old directory to a backup and the staged directory into place on the same volume, then removes the backup before launch. Same-path upgrades keep the old tree intact until staging succeeds and try to restore it on promotion failure. It still fully extracts the new payload and removes the old payload; the avoided operation is a second file-by-file write of the new tree.

By contrast, Asterism's pinned default 7z NSIS flow invokes the old uninstaller when present, writes its archive to a temporary directory, extracts to `7z-out`, then copies the expanded files to the installed directory. The old updater uninstaller may also walk and move files individually. The installers' structures explain the different amount of work, but do not assign elapsed seconds to individual operations.

## Direction

First adapt the OpenChamber packaging pattern: stop unpacking normal dependencies as independent Windows files where the app can consume ASAR, and stop shipping artifacts unused by shipped consumers. Preserve the progress-only UX, full downloads and plugin contracts. A follow-up installer change can remove the second write using same-volume staging/promotion. The simpler pinned `useZip: true` route with `differentialPackage: false` extracts directly into the destination, but keeps the uninstall-first behavior and does not provide Harness's rollback path. Do not infer either a known elapsed-time improvement or a need for differential downloads from archive-layout differences.
