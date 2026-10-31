# Stable-release readiness

Filed on 2026-10-26.

Prereleases so far are maintainer test releases with no other users; no stable release exists yet. This plan tracks the work before a stable release. Current storage migration and recovery acceptance are complete in `plans/archived/todo-2026-10-12-storage-migration.md`; future distribution-baseline obligations are tracked below. New feature interaction and protocol decisions remain separate; a computed version number does not establish product readiness.

## Prerelease channel

The stable release date/version remains undecided.

- [x] Implement shared release version/notes computation from one explicit source commit.
- [x] Update between consecutive installed prereleases: `v0.1.0-prerelease.1` → `v1.0.0-prerelease.1` downloaded, replaced on restart, and started.
- [x] Cover prerelease-to-stable candidate selection and avoiding downgrade with existing release-selection fixtures.
- [ ] Verify prerelease-to-stable selection in an installed application when an actual stable candidate exists. No stable release exists yet.
- [ ] Promote a tested latest candidate and verify stable notes, assets, and update continuation.

## User-distribution storage baseline

- [ ] Record the first build distributed to another user and its persistent format versions. Continuous n-to-n+1 migrations and old-format fixtures are required from that distribution onward.
- [ ] Verify migration from the earliest user-distributed baseline to the stable candidate once those builds exist.

## Plugin delivery

- [ ] Complete acquisition and installation without manually preparing a source directory, including exact versions and integrity.
- [ ] Complete upgrade, compatibility feedback, enablement, removal, and restart behavior.
- [ ] Decide private-data and credential cleanup choices while preserving session history.
- [ ] Verify a real external plugin through installation, use, upgrade, migration, disablement, and removal.

A marketplace service is outside the confirmed initial scope.

## Public API stability

- [x] Publish initial public packages: `@asterism-app/sdk@0.47.0` and `@asterism-app/builtin-api@0.19.1`, manually published from `e861a14`.
- [x] Integrate public-package publication into the application Release workflow, with independent package versions and channel dist-tags.
- [ ] Verify automated package publication and promotion, and complete external-plugin acceptance in `plans/todo-2026-10-27-public-api-stability.md` before declaring stable public interfaces.

Confirmed SDK boundary defects and the template-copy participation boundary are resolved. Protocol, authentication, output, and external-message extensions remain driven by concrete integrations. Shared-environment and unchanged-plugin evidence accumulate during internal development; future feature completeness is not a condition for delivering the current SDK.

## Product acceptance

- [ ] Decide the formal resource catalog and access interaction.
- [x] Accept installed model setup and execution, questions, stop/continue, reopen, and branching.
- [ ] Verify the complete first-task path from an empty installation, including material creation and access setup.
- [x] Accept settings navigation and built-in setting changes/defaults, session-status presentation, startup, and workbench panels.
- [ ] Finish plugin enable/disable/removal and external settings-page acceptance.
- [x] Exercise real tasks using Agent/Mesh collaboration, MCP, Web, terminals, and skills.
- [x] Accept Subagent Pool GUI behavior and live-provider execution. The user confirmed acceptance on 2026-10-31.
- [ ] Accept the skills settings page. Its implementation record is archived; this feature-specific check remains pending.
- [ ] Accept long-conversation continuation after automatic compaction.
- [ ] Resolve remaining stale capability claims as their concrete behavior is accepted.

## Platform and maintenance

The user confirmed desktop build/platform behavior, cross-platform behavior, and storage/migration acceptance on 2026-10-31. These plans are archived. Earlier acceptance includes installed task execution and persistence, PTY/search execution, update progress/settings navigation, cancellation of exit with an update ready, and a format-changing installed update. Remaining installed-update scenarios are tracked separately in `plans/todo-2026-09-17-release-ci.md`.

- [x] Accept desktop builds, installation/startup, core platform behavior, credentials, native modules, and process cleanup across the release platforms.
- [x] Accept current storage migration, recovery, and plugin migration failure isolation.
- [ ] Complete the remaining installed-update scenarios on each release platform.
- [ ] Verify plugin compatibility and failure isolation across application updates.
- [ ] Provide installation and issue-reporting information for the accepted platforms: application version, platform, reproduction, and logs. Models can consult the internal manual for in-product usage guidance.
- [ ] Complete and accept official branding and platform icons.
- [x] Integrate the English internal manual through resources/tools and verify direct discovery and reading. Application guides and public-package guides/examples are included in application packaging.
- [x] Accept manual creation, linking, discovery, and reading through the GUI and an installed application.

Plugin prompt/skill contributions and the paradigm layering are implemented; `plans/archived/ref-2026-10-28-plugin-paradigm-layering.md` and its archived implementation records retain the decisions, verification, and manual acceptance caveats. Captured-resource restore, provider OAuth, additional protocols, skill picking, manual compaction, media/export/sync, and a search-library replacement remain separate scope decisions.
