# @asterism-app/plugin-build

The standalone artifact builder for Asterism plugins. It supplies the `asterism-plugin-build` CLI, the `buildPlugin` authoring API, and a lightweight `/artifact` contract for consumers of completed output. Applications load those artifacts rather than compiling plugin source at startup.

Node.js 22.15.0 or newer is required to run this authoring package. Add it to a plugin project's development dependencies, then run `asterism-plugin-build` in the directory containing the plugin's package manifest. The `docs` directory owns the authoring guide, including public dependencies, styles, assets, watch behavior, and distribution boundaries.

## Package development

- `npm run build`: emit Node ESM tooling and TypeScript declarations.
- `npm run typecheck`: check the package independently.
- `npm run test:integration`: opt-in process-backed build/load fixtures, after building the package.
- `npm run pack:check`: build and verify the npm pack file list without publishing.

The integration fixtures use isolated temporary packages and cover independent provider/consumer graphs, live bindings, realm boundaries, external dependency relocation, CSS identity and closure, directory resources, workers, native-addon resolution, and failure publication. Browser code is linked as ESM for graph checks; installed Electron, production CSP, and GUI acceptance remain separate integration work.
