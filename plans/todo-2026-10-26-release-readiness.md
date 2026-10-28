# Stable-release readiness

Filed on 2026-10-26.

Prereleases are already distributed to a small group of friends; no stable release exists yet. This plan tracks the work before a stable release. Storage baselines, migration, and recovery acceptance belong to `plans/todo-2026-10-12-storage-migration.md`. New feature interaction and protocol decisions remain separate; a computed version number does not establish product readiness.

## Prerelease channel

The stable release date/version remains undecided.

- [x] Implement shared release version/notes computation from one explicit source commit.
- [x] Update between consecutive installed prereleases: `v0.1.0-prerelease.1` → `v1.0.0-prerelease.1` downloaded, replaced on restart, and started.
- [ ] Verify prerelease-to-stable selection without downgrade. No stable release exists yet; use fixtures until an actual promotion candidate is ready.
- [ ] Promote a tested latest candidate and verify stable notes, assets, and update continuation.

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
- [ ] Accept the first-task path from an empty installation through setup, material, access, execution, questions, stop/continue, reopen, and branching.
- [ ] Finish pending plugin, session-status, startup, and workbench-panel GUI acceptance.
- [ ] Exercise real tasks using agent collaboration, MCP, Web, terminals, skills, and long conversations.
- [ ] Resolve remaining stale capability claims as their concrete behavior is accepted.

## Platform and maintenance

- [ ] Accept installation, core features, credentials, processes, and updating on each release platform.
- [ ] Verify plugin compatibility and failure isolation across application updates.
- [ ] Provide installation and issue-reporting information for the accepted platforms: application version, platform, reproduction, and logs. Models can consult the internal manual for in-product usage guidance.
- [ ] Complete and accept official branding and platform icons.
- [x] Integrate the English internal manual through resources/tools and verify direct discovery and reading. Application guides and public-package guides/examples are included in application packaging.
- [ ] Accept manual creation, linking, discovery, and reading through the GUI and an installed application.

Captured-resource restore, provider OAuth, additional protocols, plugin prompt/skill contributions, skill picking, manual compaction, media/export/sync, and a search-library replacement remain separate scope decisions.
