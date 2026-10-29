# Public SDK readiness and iteration

Filed on 2026-10-27. Initial inspection: main at `262be7e`.

## Goal and accepted scope

Prepare the implemented SDK for real external plugin development and package delivery. Resolve demonstrated contract defects now, then use internal plugin development and application updates to establish compatibility evidence. Future model protocols, authentication methods, output categories, and external-message bridges are demand-driven extensions; implementing or fully designing all of them is not a prerequisite for the current SDK's delivery.

The public packages are `@asterism-app/sdk` and `@asterism-app/builtin-api`; initial versions have been published to npm. `@asterism-app/ui` remains a private implementation package. At the initial investigation, all packages were unpublished and contract fixes were applied directly with their consumers. Publication and validation evidence below define the current delivery status; stable compatibility claims remain subject to external-plugin acceptance. Existing real data requires explicit authorization before cleanup. Application data compatibility starts at the first user distribution, including friend-facing prereleases, independently of the public packages' version numbers.

Current support must describe implemented behavior. Internal testing does not establish universal compatibility across future shared libraries, native modules, protocols, or platforms. Keep independent plugin artifacts and data when claiming that an update preserves existing consumers.

## Completed foundations

- [x] Use `package.json.version` as the plugin's sole release version. Package installation and dependency ranges belong to package managers; the host binds actual public exports and reports concrete import/setup failures.
- [x] Derive provider dependencies from actual imports. Keep initialization, failure propagation, and cleanup metadata in the host, outside author definitions. Preserve shared instances through helper packages and re-exports.
- [x] Preserve input/output schema distinctions in typed calls. Callers supply schema input; implementations receive parsed input; results follow the corresponding output boundary.
- [x] Encode domain JSON at write boundaries and decode retained JSON at read boundaries. Use ordinary schemas or synchronous codecs; historical decoding does not rewrite immutable records.
- [x] Separate resource identity and title from arbitrary JSON state throughout creation, folding, snapshots, and templates. Business fields have no host-reserved names.
- [x] Make template participation explicit. A resource opts into copying its encoded creation state and names the plugin-owned current-data contracts to include. Unlisted current data, history, private storage, and running instances are excluded.
- [x] Enforce template support and saved-data validity before instantiation. New host identities and remapped host links do not rewrite embedded domain references or clone external systems. Creation handlers are not replayed; ordinary presence lifetimes apply.
- [x] Document the implemented data, ownership, lifecycle, and composition boundaries in the SDK and engineering documentation. Necessary composition exports remain available.

`plans/archived/review-2026-10-27-sdk-contract-boundaries.md` preserves the concrete findings and their dispositions. The generic contribution, call/event/channel, resource, and lifetime architecture has no unresolved confirmed redesign requirement from that review.

## Package delivery

These tasks concern actual package delivery, not future feature completeness.

- [x] Run initial offline package previews and verify fixed export targets. The previews covered the then-private `@asterism/sdk`, `@asterism/builtin-api`, and `@asterism/ui` packages; this is historical validation, not the current publication scope.
- [x] Prepare the two public packages under `@asterism-app`, including licenses, installation guidance, tarball consumer typechecks, and npm publication dry runs.
- [ ] Complete review of the two public packages' published exports, dependency closure, examples, and assets against package contents. Treat source TypeScript exports according to the supported plugin build environment.
- [ ] Complete isolated external-plugin acceptance using packed packages, including editor resolution and the host's runtime/frontend loading path. Tarball consumer typechecks have passed; they do not establish runtime or GUI acceptance. Reuse the counter and public provider/consumer examples where appropriate.
- [x] Decide package versions, npm scope ownership, publication access, and release workflow. Packages publish through the application Release workflow with independent computed versions and channel dist-tags.
- [x] Publish only after explicit authorization. `@asterism-app/sdk@0.47.0` and `@asterism-app/builtin-api@0.19.1` were published manually from `e861a14`.
- [x] Register npm trusted publishers for both packages (`release.yml` publish, `promote.yml` dist-tag).
- [ ] Verify the first automated prerelease publication and promotion.

Application-side npm acquisition, exact versions/integrity, upgrade, removal, and private-data cleanup remain delivery work in `plans/todo-2026-10-12-plugin-system.md` and `plans/todo-2026-10-26-release-readiness.md`. They are distinct from publishing the SDK package. A marketplace is outside the current scope.

## Internal development and compatibility evidence

Retain the current shared React, React DOM, React Intl, Zod, synchronous SQLite, and trusted in-process backend integration during internal development. Introduce a narrower abstraction only for a concrete need. Standard package metadata, TypeScript, and actual execution remain the checks; there is no second runtime version-range gate.

- [ ] Develop real external plugins locally and record concrete problems with imports, schemas, calls, resources, settings, and renderer composition.
- [ ] Retain a small representative set of unchanged plugin sources/packages and saved data when upgrading the application. Verify old source against candidate types and unchanged code against the candidate host; do not update every fixture alongside the host.
- [ ] Exercise shared declarations, provider failure isolation, initialization, and cleanup through these real plugins. Existing focused tests remain the mechanism-level evidence.
- [ ] Validate native modules, external assets, and installed runtime/platform behavior when those dependencies are actually used. GUI and installed-application acceptance remain user-operated.
- [ ] Record compatibility claims with the tested application and plugin versions, platform, and limitations. Fix reproducible failures at their owning boundary rather than accumulating speculative guards.

These are iterative acceptance tasks. They do not require building a parallel host, synthetic UI harness, universal plugin fixture matrix, or completing unrelated domain features. Formal stable promises should reflect the evidence accumulated during this period.

## Deferred domain extensions

The earlier API-02 through API-06 labels are retained here as ownership references for the original investigation. Their disposition distinguishes future implementation from present defects.

| Area | Disposition | Trigger and boundary |
| --- | --- | --- |
| API-02: model protocols and authentication | Deferred extension | A concrete additional protocol or renewable/signing authentication integration. Preserve the supported meaning of existing connection and credential APIs; determine how new kinds reach consumers during that work. Owned by provider authentication and runtime capability plans. |
| API-03: generated media, provider-owned operations, external senders | Deferred domain design | A selected media, server-side-tool, or message-bridge integration. Define execution ownership, representation, history, and routing for that consumer. Adding a closed-union member alone does not establish compatibility. Owned by the runtime capability plan. |
| API-04: resource copying and restoration | Present template boundary completed; richer operations deferred | Resources requiring embedded-reference mapping, external-instance cloning, or private-state reconstruction use a future explicit domain capability. History browsing continues to be observation, and current data remains shared across branches. |
| API-05: shared environment | Current integration retained; validation continues in internal development | A real shared-library upgrade or plugin using native modules/assets. Test actual behavior before changing the environment or asserting support. Package-range mismatches alone do not reject plugins. |
| API-06: old-plugin evidence | Continuous internal acceptance | Preserve and rerun real plugin artifacts and data across host updates. Accumulate evidence without blocking initial development on hypothetical combinations. |

Future extensions may add contracts, services, or explicitly selected capabilities. Their implementation must decide how existing consumers continue to behave. An unimplemented extension is neither an existing public API nor evidence that a foundational rewrite is required.

The implemented plugin paradigm layering (`plans/archived/ref-2026-10-28-plugin-paradigm-layering.md`) reclassifies prompt contributions, plugin-carried skills, MCP, manuals, roles, and Agent configuration. It changes published 0.x SDK contracts, including the model target and prompt blocks; those changes are intentional breaks before stable public interfaces. Explicit skill picking, notifications, broader content sharing, hot reload, separate plugin processes, and persistent jobs remain independently scoped work.

## Validation record

The initial readiness investigation passed typechecks and 98 selected plugin tests; that established current behavior, not old-version compatibility. Subsequent fixes recorded their focused validation in the archived review, including dependency loading, typed calls, directional data encoding, resource state, and templates.

The template participation change passed project typechecks, 95 tests across template, loader, SDK runtime, and content suites, and the bilingual catalog checks. Cases cover selected current data, undeclared data exclusion, unsupported resources, withdrawn policies, removed/invalid saved data, independent identities, immutable history, codecs, and content retention. Initial offline npm previews included all fixed export targets for the three then-private packages. That validation stage did not include npm publication, GUI acceptance, native-runtime acceptance, or real-data cleanup.

The package preparation commit `e861a14` records passing typechecks, a production build, 57 plugin tests, tarball consumer typechecks, and npm publication dry runs. The two public packages were subsequently published manually from that commit as recorded above. Commit `f82a410` integrates package publication and promotion into the application release workflows. The first automated publication and promotion, installed runtime behavior, and external-plugin GUI acceptance remain pending.
