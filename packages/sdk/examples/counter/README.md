# Build the counter plugin

This package is a complete SDK-only plugin with a backend, storage declarations, a renderer, and a small public contract boundary. It does not require the builtin Agent paradigm.

## Prepare and register

The manifest pins the public packages for the target application. Run from this directory:

```sh
npm install
npm run typecheck
npm run build
```

Add this package directory to Asterism, then restart the application. Register the directory containing `package.json`, not `src` or `dist`. After changing source, build explicitly and restart again. Source edits alone do not change the running plugin.

The builder replaces `dist` only after a completed build. Asterism loads that JavaScript artifact, not the TypeScript entries in `asterism.build`.

## Preserve the public boundary

The exact `asterism-example-counter/contracts` specifier is provided in both runtime and renderer realms. Each realm builds its own graph; the backend's runtime, storage, and public entry share that graph rather than independent copies of the contracts. `asterism.build.public` lists the specifier, and the builder resolves it through the package's `exports` entry for `./contracts`. Keep `src/contracts.ts` in the distributed package for consumers' type declarations.

A consumer declares `asterism-example-counter` as a peer dependency, which keeps imports of `asterism-example-counter/contracts` external. Installing declarations alone does not enable this provider. SDK, React, React Intl, and Zod imports also remain external to use the host instances.

The manual stays in the root-level `asterism.manual` declaration. Executable output does not replace documentation or translation metadata.

## Distribute the built package

Build before packing. Include `package.json`, `dist`, documentation, and any declarations needed by consumers. Check the actual tarball with `npm pack --dry-run`; copying source without output is not a loadable distribution. Private dependencies, if added later, install through `dependencies`; platform-dependent dependencies need validation in the target runtime.
