# Remove tests whose only possible fix is updating the expectation

Filed on 2026-11-10 while preparing a release. Completed on 2026-11-11: scoped test cleanup and separation of process-backed plugin integration checks.

## Trigger

`src/resources/resources.test.ts` asserted the exact key list returned by each `resource_inspect` detail view. A later commit intentionally added `result` to the schema view, and the full suite failed. The only possible response was to edit the expected list, so the failure found no defect. The three key-list assertions were removed to unblock the release; the name narrowing and unknown-name rejection checks in the same case remain.

## Work

- [x] Audit the test suite for assertions whose failure can only be resolved by updating the expectation: exact field or key lists of projections, literal catalog or copy contents, enumerations restated from the implementation, and output shapes that mirror the producing code.
- [x] Remove those assertions or cases. Keep a case only when its failure points to a defect in the code under test.
- [x] Amend the Validation section of AGENTS.md with an operational criterion: before writing an assertion, ask what a failure would require. If the only response is changing the expected value, do not write it. The existing "implementation-mirroring assertions" rule did not prevent this case.

## Disposition

Four review agents screened the backend, builtin Agent, builtin resources/integrations, and renderer/public-library partitions. The parent reviewed main/shared/shell/release-script tests and verified the selected findings against their implementations. The inventory covered 222 test files; implementation tracing focused on candidates and representative retained contracts rather than certifying every transitive implementation.

The approved cleanup removed complete inspection-field inventories, helper-guaranteed history order, redundant reference-predicate coverage, React-element assembly checks, primitive schema-shape checks, default-title copy, a type-only string assertion, a fixture-guaranteed absent property, and an unnecessary zero-delay timer. Mixed cases retain their meaningful transformation, state, authorization, and failure-preservation checks. The standalone primitive URL-schema test file was removed.

Custom relational refinements, deterministic timestamp/calendar calculations, controlled cancellation promises, pure UI calculations, and substantive public-protocol contracts remain. Judgment-call assertions about missing-result explanatory prose, usage-catalog naming, and plugin database layout were retained rather than removed automatically.

## Process-backed plugin tests

The user approved keeping actual plugin builds and loads as a separately invoked integration suite. These calls reach `loadPackages`/`buildPackages` and the real esbuild service process; they are not ordinary in-memory unit checks.

- Four `*.integration.test.ts` files contain 25 expanded cases covering real package builds/loads, captured startup artifacts, public package identity, and source-plugin localization.
- Six inexpensive metadata, manifest, catalog-validation, and IPC cases from the mixed package/i18n files remain in the default unit suite.
- Default Vitest discovery excludes integration files. The explicit plugin integration command selects only those files and reuses the shared test setup.
- The `.test.` marker is retained so existing runtime-module rejection and packaging exclusions continue to recognize these files.
- Manual CI has a default-off plugin integration option. Existing workflow triggers are unchanged; release unit-test steps no longer run these integration cases implicitly.
- AGENTS validation guidance now distinguishes default unit checks from opt-in plugin build/load checks and states when related implementation/dependency changes require the latter. Integration classification does not make process-backed smoke tests mandatory for unrelated changes.

## Validation

- Typechecks and the normal application build passed; the build retained its existing renderer chunk-size warning.
- Default test discovery selected 219 files and no integration files; integration discovery selected exactly the four plugin integration files.
- The default suite passed: 219 files, 1351 cases.
- The independently invoked plugin integration suite passed: four files, 25 expanded cases.
- No GUI was launched, no production behavior changed, and no new dependencies or replacement test cases were added.
- Documentation was checked for terminology, English, decision accuracy, and standalone meaning. Historical evidence above is preserved.
