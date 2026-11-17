# Plugin authoring and release readiness review

Filed on 2026-11-17. This follow-up reviews public-package organization, release preparation, and independent authoring after implementation of explicit plugin artifacts. Findings below have implementation dispositions; GUI and platform acceptance remain separate.

## Decisions

The user confirmed that complete shipped examples target the public-package versions selected for their application release. Generated development-dependency pin changes count toward the containing package's release. Candidates predating the explicit release catalogue are not supported for promotion and fail explicitly.

## Findings and dispositions

- The user published `@asterism-app/plugin-build@0.1.0`. Initial registry absence was transient; subsequent package/version requests returned HTTP 200. The installed release's attached Manual was intentionally older than the development application and was not a new implementation defect.
- Complete examples referenced an unavailable SDK version. They now use verified published SDK `1.13.2`, builtin API `0.29.0`, and builder `0.1.0`. Published SDK/API source trees were compared with the current source before choosing those pins.
- The builtin API example typechecked inside the workspace but failed independently because its renderer type graph required `react-intl`. Its peer declaration now includes that package; the independent install, typecheck, and build passed afterward.
- Builder author guidance was not exposed through Manual. Its guide now lives under the builder's shipped `docs` directory, registered as the `plugin-build` Manual source. The application packages the guide and package metadata without shipping the compiler implementation. Node requirements and the exported authoring configuration are described.
- Release collection previously relied on the current checkout's package set. The selected source now owns an explicit ordered catalogue and cutoff marker. Preparation checks out that source; collection input survives checkout outside the repository.
- Example pin stamping now shares a version writer with package manifests. Planning compares dependency publications paired at the owner's baseline, propagates derived patch releases in catalogue order, preserves direct semantic bumps, and handles partially completed publications and newly introduced dependencies.
- CI and preparation share the check command without duplicating the default test prehook build. Package emission belongs to prepack; changed publications install dependencies once, while dist-tag-only publication skips dependency installation. Reuse after interrupted publication requires matching registry source identity.

An independent focused review of the updated planner and workflows found no actionable correctness gaps. Its 37 focused planning/version-writing tests passed. It did not exercise remote Actions or trusted publishing.

## Validation evidence

Two distinct authoring checks passed:

1. Copy both complete examples outside the repository, install actual published dependencies, then typecheck and build. This exposed and verified the missing-peer correction.
2. Pack the release-catalogue packages, compare shipped guides/examples with their source, copy the packed examples into isolated projects, install the tarballs with ordinary registry dependencies, then typecheck, build, and validate selected artifacts using the installed builder. Installed public packages are not workspace links. A temporary negative control omitting the required peer failed as expected and was reverted.

The second check is retained in the opt-in plugin integration suite. Tarball overrides intentionally accommodate source-manifest version placeholders; that test does not prove registry availability of future release pins or application loading.

Final local validation passed:

- Backend and renderer typechecks, 1,659 default tests in 257 files, and bilingual catalog checks through `npm run check`.
- 26 host/loader/installer/Electron/external-example integration tests, plus nine standalone builder fixtures through `npm run test:plugins`.
- Builder pack verification, with 12 files including the author guide.
- macOS arm64 unpacked application build. Direct archive inspection confirmed the builder guide matches source and the builder's implementation directories are absent.
- Workflow YAML parsing, lockfile dependency inspection, and whitespace validation.

No GUI automation or real application-data cleanup was performed. Temporary independent-author projects were removed after validation. No assistant commit, push, npm publication, or remote workflow invocation occurred; the initial builder publication was performed by the user. Registry `gitHead` from that dirty checkout identifies the committed base, not the uncommitted builder bytes; future manual bootstrap publications should use committed inputs.

## Acceptance boundary

The user's next test uses the development application's Manual and examples in a fresh session: independent plugin creation, build, local registration, restart, and actual use. The old installed Manual is not the test input. Browser import maps/CSP/workers, GUI installation and restart behavior, Windows/Linux execution, and comparable startup timings remain outside the local evidence above. Remote CI and npm trusted publishing also remain unexercised.
