# Plugin module boundary review

Filed on 2026-11-17. This review examined the explicit plugin artifact implementation for loading mechanisms that depended on patches whose number would grow with the plugin dependency set. The user approved the resulting design and its implementation in the same session.

## Findings

- Backend artifacts bundled npm dependencies into ESM. Each class of package behavior (native addons, package-relative files, dynamic require, export conditions) needed its own exception: `runtimeExternals`, `.node` classification, a `createRequire` banner, and installation-anchored resolution.
- Backend host modules were synthesized `data:` facades over a global table. A private CommonJS dependency calling `require("zod")` failed in Electron 45 Node mode with `ENOENT` for the `data:` URL; this was reproduced with an actual built plugin.
- The application-supplied module list existed in four places across the builder and host.
- Immutable `builds/<uuid>` directories plus a pointer guarded a running application against a rebuild under it. This is a speculative interleaving per the engineering principles; the cost was a pointer format, distribution filtering, and 21 retained builds (382 MB) from development startups.
- `--watch` rebuilt below the package root only and had no use under restart-bound loading.

## Disposition

Module boundaries are delegated to the platform resolvers:

- The backend graph compiles only plugin sources and leaves every installed package as a bare import resolved by Node from the plugin package. The listed exceptions were removed.
- Peer dependencies declare what the application or another plugin supplies; `publicDependencies` and `publicPackages` were removed. Public entries are listed as specifiers and resolve through package `exports`.
- The application build emits each backend host module as a real chunk re-exporting its own instances; the resolution hook remaps only recorded peer imports. Import and require reach the same instance.
- One host module list lives in `@asterism-app/plugin-build/artifact`.
- A build replaces `dist` as a whole after success; pointers, build IDs, and watch mode were removed. Managed npm installation directories keep their per-installation lifetime.
- The renderer still bundles private dependencies because the browser has no package resolver; its page facades over stable instances are unchanged.

The artifact format advanced to 2 and the authoring manifest changed incompatibly. The published builder 0.1.0 does not produce loadable artifacts for this host.

## Validation and acceptance

Backend/renderer typechecks, 1,668 default unit tests, bilingual catalogs, 27 opt-in host/loader/installer/Electron/external-example tests, 10 builder fixtures, builder pack verification, and a macOS arm64 unpacked package build passed. The packaged built-in plugin was loaded by the Electron Node-mode harness with its dependencies resolved from the packaged tree.

GUI behavior, startup timing with unbundled backend dependencies, and Windows/Linux remain unaccepted. A peer import inside an installed dependency's own code follows ordinary npm resolution and can load a private copy; this boundary is documented rather than handled.
