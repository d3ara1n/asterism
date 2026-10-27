# Distribution and stable-release readiness

Filed on 2026-10-26.

The distribution gate is agreed. New feature interaction and protocol decisions remain separate; a computed version number does not establish product readiness.

## Distribution boundary

Maintainers first verify prerelease installers internally. Sharing a build with friends begins user-facing compatibility obligations, even before a stable release.

Before sharing, the actual distribution platforms need accepted update, migration, and recovery behavior. The first distribution platforms and stable release date/version remain undecided.

## Before sharing prereleases

- [x] Implement shared release version/notes computation from one explicit source commit.
- [ ] Accept two consecutive installed prereleases: setup, real tasks, native helpers, download, restart replacement, and retained work.
- [ ] Accept a real format-changing update and consecutive migrations across skipped app versions, using isolated data and fixtures.
- [ ] Accept migration failure, restore, retry, and fresh-start recovery, including plugin failure isolation.
- [ ] Verify prerelease-to-stable selection and data continuation, using fixtures until an actual promotion candidate is ready.
- [ ] Record the first user-distributed version, source commit, and storage baselines, and retain migration fixtures.
- [ ] Provide necessary installation and issue-reporting information for the accepted platforms; in-product usage guidance will come through models consulting the internal manual.

## Plugin delivery

- [ ] Complete acquisition and installation without manually preparing a source directory, including exact versions and integrity.
- [ ] Complete upgrade, compatibility feedback, enablement, removal, and restart behavior.
- [ ] Decide private-data and credential cleanup choices while preserving session history.
- [ ] Verify a real external plugin through installation, use, upgrade, migration, disablement, and removal.

A marketplace service is outside the confirmed initial scope.

## Public API stability

- [ ] Complete public-package delivery and record the compatibility scope supported by internal plugin development in `plans/todo-2026-10-27-public-api-stability.md` before declaring stable public interfaces.

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
- [ ] Verify migration from the earliest user-distributed baseline to the stable candidate.
- [ ] Establish issue-reporting information: application version, platform, reproduction, and logs.
- [ ] Complete and accept official branding and platform icons.
- [ ] Integrate the English internal manual through resources/tools and verify that models can discover and read it.
- [ ] Promote a tested latest candidate and verify stable notes, assets, and update continuation.

Captured-resource restore, provider OAuth, additional protocols, plugin prompt/skill contributions, skill picking, manual compaction, media/export/sync, and a search-library replacement remain separate scope decisions.
