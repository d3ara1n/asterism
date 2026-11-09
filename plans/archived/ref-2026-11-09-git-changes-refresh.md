# Git changes views and refresh triggers in editors and agent tools

Filed: 2026-11-09. Status: consumed research; implementation disposition recorded below.

## Question and method

Asterism directory resources need a convenient list of changed files and a way to inspect their diffs. Obtaining Git data is straightforward; this investigation focuses on when other applications obtain it and how their interfaces communicate the comparison scope.

Four research agents investigated VS Code and its forks; Zed and JetBrains; Claude Code, Codex, and pi; and OpenCode, Cline, Roo Code, and Aider. Findings below combine source inspection and official documentation. No GUI experiments or latency benchmarks were performed. Source-backed behavior, documented behavior, and suggestions for Asterism are distinguished. An unverified trigger is not evidence that the trigger does not exist.

Version caveat: online documentation and unpinned branches can change. VS Code and Zed have pinned source evidence below. OpenCode requires particular care: the web index returned an older `pages/session.tsx` view under a moving `dev` URL, but direct access at the current `dev` commit returned 404 because the file had moved. The concrete OpenCode mechanism reported below was separately checked at an existing historical commit; it is not a claim about the current release.

## Main findings

1. There is no single refresh moment. Editor implementations combine an initial query, filesystem invalidation, explicit Git-operation completion, and manual refresh. Some defer background work until focused. Agent interfaces can additionally invalidate at tool or turn boundaries.
2. A watcher provides an invalidation signal, not a new Git state. Applications still query status, update their models, and notify consumers. A worktree watcher alone does not cover index-only or ref-only changes.
3. Changed-file lists, line statistics, open diff contents, and unsaved editor buffers have different costs and update paths. A refreshed count does not prove an already-open diff has refreshed.
4. Repository state, a temporal checkpoint comparison, and a recorded agent edit are separate products. A checkpoint does not inherently establish authorship; a tool-edit record does not necessarily include shell changes.
5. Source visibility varies substantially. Closed-source agent apps often document their review UX without documenting their watcher or scheduling policy. Their behavior should not be inferred from VS Code ancestry or protocol event names.

## Comparison

| Product / surface | Comparison and UX | Verified retrieval or refresh triggers | Evidence boundary |
| --- | --- | --- | --- |
| VS Code Git SCM | Repository-wide Changes, Staged Changes, conflicts, optional separate untracked group; file and multi-file diff | Initial repository status; worktree and Git metadata events; built-in mutations; manual Refresh | Pinned source |
| Zed Git Panel / Project Diff | Repository files and staging state; editable multi-file diff; file/hunk staging | Worktree entry changes and Git directory events; changed-path batching; separate reload of open diff bases | Pinned source; initial full status sequence not completely traced |
| JetBrains IDEA | Commit tool window, changelists or optional Git staging area, file diff | Disk notifications and VFS refresh feed VCS dirty scopes; configurable external-file synchronization on focus/tab changes | Official platform docs and moving source; full Git metadata watcher chain not traced |
| Cursor | Git sidebar plus separate Agent changes, checkpoints, and review | Review/checkpoint workflows documented; exact SCM scheduling unknown | Official UX documentation, not fork implementation evidence |
| Windsurf | SCM plus Cascade edits/reverts/checkpoints; separate worktrees | Workflow documented; exact SCM scheduling unknown | Official UX documentation |
| Claude Code `/diff` | Persistent fullscreen panel or classic dialog; Current working tree and separate turn views | Panel refreshes when Claude edits a file or runs a shell command | Official behavior documentation; external watcher/focus/polling internals unknown |
| Codex app | Repository review scope selector: Unstaged, Staged, Commit, Branch, Last turn; file/hunk actions | Complete repository-panel scheduling unknown | Official UX documentation |
| Codex CLI / app-server | Explicit `/diff`; separate turn aggregate diff notifications | `/diff` invocation; `turn/diff/updated` when turn aggregate changes | Command/protocol evidence; not desktop Git-panel refresh evidence |
| OpenCode desktop/web, historical source | Demand-enabled Git/branch review; file list, diff style, file detail | Query mount, window focus, filesystem events with 100 ms debounce, review opening under a specific condition, non-idle to idle transition | Pinned historical source from 2026-08-20, not verified current release behavior |
| Cline | Latest completed run's View Changes opens VS Code multi-file checkpoint comparison | User click calculates checkpoint-to-current-workspace differences | Merged implementation PR and moving core source |
| Roo Code | Task checkpoint View Differences and restore | User requests comparison; checkpoint capture occurs at task/file-edit boundaries | Official docs; full source chain not traced |
| Aider | Terminal `/diff`; default automatic Git commits | Explicit command, using a message-related commit baseline | Official docs and moving source |
| pi | Edit-tool preview and result diff in transcript | Complete edit parameters enable preview; actual tool result supplies the committed edit diff | Source; not evidence of a built-in repository changes panel |

## Editor mechanisms

### VS Code

Pinned source: `microsoft/vscode` commit `a90f3fec1557abc074c16d9e982dee5510c0986a`.

- [Repository implementation](https://github.com/microsoft/vscode/blob/a90f3fec1557abc074c16d9e982dee5510c0986a/extensions/git/src/repository.ts): worktree/Git-event setup is around lines 930–955; automatic refresh scheduling is at [lines 3339–3387](https://github.com/microsoft/vscode/blob/a90f3fec1557abc074c16d9e982dee5510c0986a/extensions/git/src/repository.ts#L3339-L3387).
- [Repository discovery](https://github.com/microsoft/vscode/blob/a90f3fec1557abc074c16d9e982dee5510c0986a/extensions/git/src/model.ts): `doInitialScan` and `openRepository` discover repositories and schedule an initial `repository.status()`. The inspected implementation limits concurrent initial status queries to five. Repository discovery and completed status loading are separate stages.
- The worktree watcher covers ordinary changes beneath the repository root and filters Git metadata out of that stream. `DotGitWatcher` separately observes actual Git directories, including worktree arrangements. Its first-level path excludes `index.lock` and Watchman cookies; upstream refs have an additional watcher. Do not generalize this to a single recursive watcher over every Git metadata path.
- `onFileChange` skips the automatic status path when `git.autorefresh` is disabled, the repository has exceeded the status-entry limit, or an operation is running.
- Eligible events enter a **1,000 ms debounce**, then a throttled task waits for an idle operation state and a focused window, runs status, and waits **5 seconds**. This is event-driven scheduling, not a five-second polling loop. Focus resumes pending work; this code does not imply an unconditional status query on every focus event.
- `Repository.run` updates model state after non-read-only built-in operations. A stage/commit/checkout invoked inside the extension therefore does not rely solely on filesystem notifications. External commands depend on relevant events and the scheduling conditions; their completion is not an immediate-refresh guarantee.
- The inspected default status limit is 10,000 entries. Hitting it produces a partial-results warning and disables this file-event auto-refresh path. Untracked files can be mixed, separate, or hidden. Discovery exclusions, filesystem watcher exclusions, Explorer hiding, and Git ignore rules are different mechanisms.
- [Git virtual filesystem provider](https://github.com/microsoft/vscode/blob/a90f3fec1557abc074c16d9e982dee5510c0986a/extensions/git/src/fileSystemProvider.ts#L51-L99): cached Git-resource change notifications use a separate **1,100 ms debounce** and can wait for focus. Particular operations can notify original resources directly. The five-minute timer here cleans URI cache entries; it is not status polling.
- The source has cancellation for model updates. This establishes a cancellation mechanism, not an atomic snapshot across worktree, index, refs, and editor buffers.

UX: staging is visible as its own group, and a file can appear in both staged and unstaged groups. Clicking either entry chooses the corresponding comparison. The diff baseline may be index or HEAD depending on the group and resource resolution. Source Control is not an authorship view of the current agent's work.

Additional primary references: [Source Control overview](https://code.visualstudio.com/docs/sourcecontrol/overview), [troubleshooting](https://code.visualstudio.com/docs/sourcecontrol/troubleshooting), [File Watcher Internals](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals), [Git settings](https://github.com/microsoft/vscode/blob/a90f3fec1557abc074c16d9e982dee5510c0986a/extensions/git/package.json), [watch helper](https://github.com/microsoft/vscode/blob/a90f3fec1557abc074c16d9e982dee5510c0986a/extensions/git/src/watch.ts).

### Zed

Pinned source: `zed-industries/zed` commit `47c46191f4e46fa0c761b7fedeb60218803ca60f`.

- [GitStore event dispatch](https://github.com/zed-industries/zed/blob/47c46191f4e46fa0c761b7fedeb60218803ca60f/crates/project/src/git_store.rs#L2390-L2428) maps `WorktreeUpdatedEntries` to affected repositories.
- [`paths_changed`](https://github.com/zed-industries/zed/blob/47c46191f4e46fa0c761b7fedeb60218803ca60f/crates/project/src/git_store.rs#L10400-L10475) gathers/deduplicates paths and schedules status and three statistics categories: HEAD-to-worktree, HEAD-to-index, and index-to-worktree. This is a stronger incremental architecture than rerunning all presentation calculations for every file event. It does not imply every Git operation can be treated as a single-file update.
- [Git directory watching](https://github.com/zed-industries/zed/blob/47c46191f4e46fa0c761b7fedeb60218803ca60f/crates/worktree/src/worktree.rs#L3620-L3725) covers repository metadata and refs; shared directories matter for linked worktrees.
- Repository changes separately trigger [buffer diff-base reload](https://github.com/zed-industries/zed/blob/47c46191f4e46fa0c761b7fedeb60218803ca60f/crates/project/src/git_store.rs#L3134-L3155). [Base loading](https://github.com/zed-industries/zed/blob/47c46191f4e46fa0c761b7fedeb60218803ca60f/crates/project/src/git_store.rs#L6591-L6675) obtains index and HEAD content for relevant buffers.
- `FS_WATCH_LATENCY` is 100 ms in this source. It is a watcher setting, not a guaranteed end-to-end Git UI delay. Some scan results use scan IDs to avoid particular stale updates; this is an observation about Zed, not a recommended coordination model for Asterism.
- Full initial Git loading, panel-visibility/focus conditions, all action-completion refreshes, and any periodic status polling were not completely traced.

UX: [Git Panel and Project Diff](https://zed.dev/docs/git) combine a compact repository/file list with multi-file review and hunk/file staging. [Agent Review](https://zed.dev/docs/ai/agent-panel#reviewing-changes) is a separate agent-edit review with keep/reject controls; its optional file review can temporarily replace the Git diff display in the editor. The two review scopes are not interchangeable.

### JetBrains

[Virtual File System](https://plugins.jetbrains.com/docs/intellij/virtual-file-system.html) and [Virtual Files](https://plugins.jetbrains.com/docs/intellij/virtual-file.html) describe a disk-to-VFS snapshot boundary. Startup refreshes the project asynchronously. Native watchers on major platforms let refresh inspect reported paths; without them, refresh traverses its selected scope. A disk mutation is not automatically a completed VCS-model refresh.

The VCS layer uses dirty scopes: [`AbstractVcs.getChangeProvider`](https://github.com/JetBrains/intellij-community/blob/master/platform/vcs-api/src/com/intellij/openapi/vcs/AbstractVcs.java), [`ChangeProvider.getChanges`](https://github.com/JetBrains/intellij-community/blob/master/platform/vcs-api/src/com/intellij/openapi/vcs/changes/ChangeProvider.java), and [`ChangeListManagerImpl`](https://github.com/JetBrains/intellij-community/blob/master/platform/vcs-impl/src/com/intellij/openapi/vcs/changes/ChangeListManagerImpl.java) show scope collection, invalidation, and changes-view refresh. These are moving source links, not pinned release evidence.

[System settings](https://www.jetbrains.com/help/idea/system-settings.html) offer external-file synchronization when switching back to the IDE or opening a tab. The documented experimental 15-second inactive-IDE synchronization concerns files; it is not proof of a 15-second Git status poll. Remote automatic fetch is also unrelated to local status freshness.

UX: [Commit and push](https://www.jetbrains.com/help/idea/commit-and-push-changes.html) documents changelists and optional Git staging; [version comparisons](https://www.jetbrains.com/help/idea/comparing-file-versions.html) documents diff surfaces. The complete `.git/index`/HEAD/ref watcher chain and exact action-completion scheduling remain unverified. IDEA documentation was inspected; WebStorm was not independently checked setting by setting.

### Cursor and Windsurf

Cursor's [Git integration](https://cursor.com/docs/integrations/git), [checkpoints](https://cursor.com/docs/agent/chat/checkpoints), and [Agent Review](https://cursor.com/docs/agent/agent-review) distinguish ordinary Git work from agent checkpoints and model-powered review. Its checkpoint documentation says local agent checkpoints are independent of Git and do not track manual modifications. No source-backed Git scheduler was established.

Windsurf's [Cascade](https://docs.windsurf.com/windsurf/cascade), [worktrees](https://docs.windsurf.com/windsurf/cascade/worktrees), and [hooks](https://docs.windsurf.com/windsurf/cascade/hooks) document edit review/reversion, isolated worktrees, and lifecycle hooks. The existence of post-write or response-completion hooks does not establish that SCM refreshes at those hooks. Neither fork's SCM watcher policy should be copied from upstream VS Code as if verified.

## Agent-specific mechanisms

### Claude Code

[Interactive mode, `/diff`](https://code.claude.com/docs/en/interactive-mode#review-changes-with-diff) explicitly states that the fullscreen diff panel stays open and refreshes each time Claude edits a file or runs a shell command. The panel requires a Git repository, fullscreen rendering, at least 110 terminal columns, and version 2.1.287 or later; automatic opening on editing has a wider-terminal condition. Classic rendering uses a dialog instead.

The list shows file additions/deletions, with a diff beneath it and an action to attach a file's diff to a prompt. The scope/source controls distinguish Current working-tree changes, session-related changes, branch comparison, and individual turn views. Turn views come from Claude file-edit records, not Git; shell-generated changes appear in Current rather than those turn views. Tests and generated files are initially hidden/collapsed, and pre-session changes are grouped separately.

The documentation also says unfinished merge, rebase, cherry-pick, or revert operations retain the last Git result; the panel updates on a refresh after the operation ends. This is product-specific documented behavior, not a general recommendation to hide current repository state.

[Checkpointing](https://code.claude.com/docs/en/checkpointing) is separate. Rewind does not universally capture shell, external, or other-session changes. Native watchers, external index-only operations, focus behavior, debounce, and polling for the diff panel remain unknown.

### Codex

[Review documentation](https://developers.openai.com/codex/code-review) describes a repository-wide panel, not just the current conversation's changes. Its scope selector includes Unstaged, Staged, Commit, Branch, and Last turn. It supports whole-diff, file, and hunk stage/unstage/revert and inline feedback. A file can legitimately occur in staged and unstaged views.

The desktop application's full refresh scheduler is not public in the sources inspected. [App features](https://developers.openai.com/codex/app/features/) describe project/worktree use but do not establish watcher, polling, focus, or invalidation contracts.

The CLI's [`SlashCommand`](https://github.com/openai/codex/blob/main/codex-rs/tui/src/slash_command.rs) describes `/diff` as Git diff including untracked files, usable during a task. Invocation is verified; continued automatic updating of an open view was not established.

[App-server](https://developers.openai.com/codex/app-server) describes `turn/diff/updated`, a turn aggregate unified diff notification. A turn aggregate is not the complete current Git state. Its existence does not establish which mechanism refreshes the app's repository panel. `/review` initiates model code review rather than merely reloading a diff.

### OpenCode: historical, source-verified example

Pinned historical source: [`packages/app/src/pages/session.tsx` at `d6deed67521a185685591f37d47c09b26ff9f89f`](https://github.com/anomalyco/opencode/blob/d6deed67521a185685591f37d47c09b26ff9f89f/packages/app/src/pages/session.tsx), dated 2026-08-20. This pin was checked directly after the web-indexed moving URL proved unsuitable for a current-version claim.

- [Lines 538–580](https://github.com/anomalyco/opencode/blob/d6deed67521a185685591f37d47c09b26ff9f89f/packages/app/src/pages/session.tsx#L538-L580): `wantsReview` enables work when a relevant desktop review/file-tree surface or mobile changes tab needs it, the connection is active, and the project uses Git. The key includes server/directory/branch information and comparison mode. Git mode queries `working`; branch mode queries branch differences. The query explicitly uses `refetchOnMount: "always"` and `refetchOnWindowFocus: true`.
- [Lines 592–609](https://github.com/anomalyco/opencode/blob/d6deed67521a185685591f37d47c09b26ff9f89f/packages/app/src/pages/session.tsx#L592-L609): filesystem events invalidate queries with a **100 ms debounce**. Opening Review can request another refresh when the tree was already open and no fetch is running.
- [Lines 939–946](https://github.com/anomalyco/opencode/blob/d6deed67521a185685591f37d47c09b26ff9f89f/packages/app/src/pages/session.tsx#L939-L946): non-idle to idle session transition triggers the same refresh.
- `loadReviewDiff` requests file details separately and compares returned line counts with summary metadata. This is not proof of complete content consistency.
- This pin explicitly leaves turn diffs unimplemented in that path (`reviewDiffs`, lines 611–616). A different web-indexed source snapshot used turn summaries and a different event handler. Combining those snapshots into one claimed current implementation would be incorrect.

This historical example is useful because it visibly combines demand loading, filesystem invalidation, focus, and an agent-idle boundary. It does not prove how the current release handles external index-only changes or whether the current UI retains the same design.

### Cline and Roo Code

Cline's merged [PR #13072](https://github.com/cline/cline/pull/13072), merge commit `9cbc24d`, traces the latest completed run's View Changes button through `CheckpointsService.checkpointViewLatestChanges`, `SdkController.viewLatestCheckpointChanges()`, and `ClineCore.compareCheckpoint()` to VS Code's `vscode.changes` multi-file diff surface. Comparison occurs on click. The button is restricted to the latest completed item because the other endpoint is the current workspace, which continues changing.

[`checkpoint-diff.ts`](https://github.com/cline/cline/blob/main/sdk/packages/core/src/session/checkpoint-diff.ts) compares checkpoint content with workspace files and batches Git blob reads. This is not a continuously maintained Git SCM model. [Cline checkpoint docs](https://docs.cline.bot/core-workflows/checkpoints) and the SDK migration PR describe different implementation contexts; their capture timings should not be merged uncritically.

[Roo checkpoint docs](https://docs.roocode.com/features/checkpoints) describe task-scoped shadow Git checkpoints at task start and before file modifications, not automatically before command execution. View Differences compares a checkpoint with current files. The full live-diff refresh implementation was not traced.

In either case, a temporal comparison can include concurrent user or external changes. A checkpoint does not prove that every included difference was authored by the agent. Restoring a checkpoint is a different feature from inspecting repository status.

### Aider and pi

[Aider Git integration](https://aider.chat/docs/git.html) defaults to automatic commits and can commit pre-existing dirty changes before editing them. `/diff` is an explicit command with a message-related commit baseline; [`raw_cmd_diff`](https://github.com/Aider-AI/aider/blob/main/aider/commands.py) handles the actual comparison. This is not a permanent live changes list. [Options](https://aider.chat/docs/config/options.html) include configurable commit and diff behavior.

pi's [`edit` tool](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit.ts) previews a complete edit request and returns the actual before/after edit diff. That is a tool-operation diff, not HEAD/index status. The [Git checkpoint example](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/git-checkpoint.ts) is an optional extension. Branch-label watchers in footer code likewise do not establish repository diff watching. No default full repository changes panel was established in this investigation.

## What the comparison baseline means

| Scope | Meaning | Important consequence |
| --- | --- | --- |
| Index to worktree | Unstaged tracked-file changes | Staging changes the baseline without necessarily changing the file |
| HEAD to index | Staged changes | A file can also retain a separate unstaged delta |
| HEAD to worktree | Net tracked-file content relative to HEAD | Opposing staged/unstaged edits can cancel in the net diff even while status remains dirty |
| Base branch / merge base | Branch development compared with another reference | Committed work can be included; not a synonym for uncommitted changes |
| Checkpoint to current workspace | Changes since a captured temporal baseline | Can include other writers; capture coverage matters |
| Recorded tool or turn edits | Changes recorded by the agent runtime | May omit shell and external modifications |

Untracked, deleted, binary, conflicted, renamed, and submodule entries require appropriate representations; not every status entry is an ordinary text diff. Status, counts, and baseline labels should agree, but there is no reason to load every full patch just to show a changed-file list.

## Asterism's current directory implementation

The repository was clean before this research document was added. No implementation files were modified.

- `packages/builtin/src/filesystem/git-status.ts` already queries porcelain status and sums a tracked-file HEAD-to-worktree numstat. It includes untracked entries in the status list, but those files are not included in that ordinary tracked-file numstat.
- `packages/builtin/src/filesystem/contract.ts` exposes `DirectoryStatus` with a flattened status per path. It does not retain staged/unstaged dimensions or a dedicated conflict category. Implementing two accurate SCM groups would require richer data rather than only filtering the existing tree model.
- `packages/builtin/src/filesystem/tree-store.ts` initially refreshes in the constructor. Manual refresh re-reads loaded directories and Git status together, and a store survives card remounts. No filesystem, focus, tool-completion, or turn-completion subscription appears in this store.
- `packages/builtin/src/filesystem/FileTree.tsx` supplies tree filtering, Git decorations, summary counts, and a manual refresh control. It is not a changed-files-only surface; deleted files need an independent status-driven list because they are absent from the filesystem tree.
- `packages/builtin/src/filesystem/FileView.tsx` reads on file/view dependencies or an explicit failed-read retry, not from a live filesystem subscription.
- `packages/builtin/src/filesystem/FileEditor.tsx` reloads its Git base on mount/dependency changes and after saving. Existing editor change indicators do not establish an independent repository diff browser or external-edit synchronization contract.

Thus the missing feature is not Git access from scratch. It is a status-driven review surface, explicit comparison semantics, and a refresh/invalidation lifetime separate from the directory tree's current manual reload.

## Candidate direction for discussion, not approved design

### Product scope

The user's stated need is closest to a repository/directory changes browser, not an agent-only checkpoint system. A first scope could provide a Files/Changes switch, changed-file count and status labels, and click-to-open read-only diff. Reuse the existing object/island presentation. Keep destructive Git actions, commit UI, checkpoints, and agent authorship outside the initial scope unless explicitly requested.

Two semantic choices remain open:

1. Net changes against HEAD are simpler for review and align with the current summary, but do not faithfully expose both Git dimensions.
2. Separate staged/unstaged groups match VS Code and correctly represent a file with both kinds of changes, but require richer contracts and group-specific baselines.

Also decide how a directory inside a larger repository is scoped. Existing status is restricted to the resource root; a repository-wide design must not silently turn an authorized subdirectory into a UI for unrelated repository paths. Repository discovery is not an authorization grant. Multiple repository roots and nested repositories require an explicit product rule rather than accidental Git traversal.

### Refresh policy to evaluate

- Query when the Changes surface becomes active; keep manual refresh.
- While that surface needs live data, observe relevant worktree and actual Git metadata changes and coalesce invalidations. Resolve Git directories correctly for linked worktrees rather than assuming `.git` is always a directory beneath the root.
- Requery after Asterism-owned save/stage/revert operations that affect the view. Tool/turn completion can supplement filesystem observation, but cannot cover other editors, terminals, or agents by itself. A long shell command may change files before it finishes.
- Revalidate on focus or reopening if background work was suspended. Whether the file-tree badge also needs background status is a product choice; visibility alone is not enough if users expect a live badge on a closed panel.
- Keep status/list refresh separate from full patches. Load the selected diff on demand; invalidate it when its file or baseline changes, even if file count remains unchanged.
- Start with ordinary event coalescing and serialized queries rather than an elaborate incremental index. A scheduling detail can record that relevant work arrived during an active read and run one subsequent read; no speculative generation/revision protocol is needed.
- Do not introduce fixed-interval polling, watcher-failure recovery, arbitrary patch quotas, or large-repository disabling merely because another product has them. Choose these only against an explicit Asterism contract or measured problem. Actual watcher/Git failures should remain visible; an error must not be presented as a clean repository.

This is a set of discussion candidates, not permission to alter interaction paradigms, Git semantics, dependencies, authorization, storage, or runtime protocols. Implementation scope should be confirmed separately.

## Evidence limitations and follow-up questions

- Exact current schedulers remain unknown for Cursor, Windsurf, Codex desktop, and parts of Claude Code. Official UX is not source evidence of internals.
- OpenCode's useful pinned example is historical. Current-version verification should start from the current architecture rather than the removed file URL.
- JetBrains' full Git metadata path and the initial status chains for several products were not traced completely.
- No performance, watcher overflow, cross-platform behavior, or GUI latency was measured. Timing constants describe inspected code paths, not user-visible guarantees.
- This research does not establish a need for a new dependency or prescribe an implementation architecture. Before implementation, decide comparison scope, staging semantics, whether badges update when the panel is closed, and how existing dirty editor buffers interact with a live diff.

## Follow-up: recursive watching and lazy Changes trees

The user confirmed the Files/Changes view split and a single update entry with a one-second debounce. The choice between tool-invocation triggers and filesystem/Git-metadata subscriptions remains under discussion; no dependency or implementation was approved.

### Recursive watcher feasibility

- [Parcel watcher](https://github.com/parcel-bundler/watcher) provides one recursive subscription API across macOS, Linux, and Windows, with native backends and batched/coalesced create/update/delete events. Rename is represented as delete/create. Its ignore option accepts paths and patterns. Application-level one-second debounce remains separate from its internal batching.
- Linux inotify does not provide a single recursively covering watch. A recursive library manages that underneath its public subscription; it cannot remove kernel watch limits or make arbitrary directory trees free to observe.
- Modern [Node fs.watch](https://nodejs.org/api/fs.html#fswatchfilename-options-listener) also supports Linux recursive watching, added in v19.1.0. The application's Node minimum is 22.13.0; an older blanket claim that Linux cannot use a recursive Node API would be wrong. The kernel-resource distinction still applies.
- Parcel supplies filesystem events, not staged/unstaged/untracked/conflict classifications. No maintained all-in-one Node package covering the complete desired contract was established. Git porcelain remains the authority for Changes.
- Chokidar is another maintained cross-platform abstraction. It has normalized file/directory events and different deployment/normalization tradeoffs; do not treat moving main-branch documentation as the selected release.
- Parcel is a native dependency with Node-API/prebuild support. Electron platform/architecture/libc packaging needs to be accounted for, not described as necessarily requiring ABI recompilation on every Electron upgrade. No package was installed.
- Watch limits, event overflow, and network/virtualized filesystem limitations remain operational constraints. A one-second debounce reduces Git queries; it does not reduce the number of underlying watches. Collapsing the UI does not reduce recursive watcher coverage either.
- Exclusions must preserve the chosen semantics. Hard-excluding node_modules or Git-ignored paths can miss intentionally tracked files or Files-view updates; Parcel does not implement Git ignore semantics automatically.

### Lazy changes are not identical to lazy filesystem listings

[Git status](https://git-scm.com/docs/git-status) explicitly distinguishes normal and all untracked output. Normal can return an entire untracked directory as one entry; ignored directories are absent by default. Tracked modifications still appear as individual file records. A Changes tree can lazily render those records without making the underlying status query incremental.

Temporary isolated Git 2.54.0 experiments, cleaned up after execution, established:

```text
status -unormal at the repository root:
  M src/a.txt
  M src/deep/b.txt
 ?? node_modules/

status -unormal -- node_modules/:
 ?? node_modules/

git -C node_modules status -unormal -- .:
 ?? node_modules/
```

Neither changing cwd nor using a single node_modules/* pathspec yields a depth-one listing in this example. Enumerating direct filesystem children and passing their explicit paths does yield individual direct files and collapsed child directories. This also worked with ls-files --others --exclude-standard --directory. Production code would need literal-safe path selection and ordinary scope/error handling; these experiments do not prove bounded scan cost or constitute an implemented design.

Practical choices are: render a grouped/virtualized status tree, preserve collapsed untracked directories, load their contents on expansion, and load full patches only on selection. Exact descendant counts require enumeration. Git offers subtree pathspecs, not a general depth-one or paginated git-status interface.

### Refresh-entry implications

A filesystem subscription can be the normal trigger regardless of which resource, terminal, or external process authored the change. Worktree events can invalidate loaded Files directories and Changes; Git metadata events invalidate status and relevant diff bases. Both enter the same one-second scheduler. Files loading scope and watcher coverage are different decisions.

A trailing one-second debounce runs after activity settles, not every second during continuous writes. An event arriving during a query should not be discarded merely because a refresh is active; a simple pending subsequent refresh can preserve it without a revision/generation protocol.

[Git background refresh documentation](https://git-scm.com/docs/git-status#_background_refresh) recommends --no-optional-locks for background status, which otherwise may write cached index metadata. Asterism's existing filesystem/git.ts helper already uses --no-optional-locks. Preserve that behavior when connecting index notifications to background status queries.

If automatic watching is selected, manual refresh and an initial view read still have independent purposes; tool-call instrumentation need not become a second automatic event system. Error presentation and the supported filesystem scope should remain explicit rather than promising lossless notifications or silently adding polling.


## Implementation disposition (2026-11-09)

The user approved Files/Changes views, a Git-derived virtual changes tree with terminal directory summaries, lazy selected-file diffs, and active-view-only observation through one one-second debounce entry. The user separately approved a native watcher dependency and requested a maintenance/modernity comparison before selection.

The final candidate is @parcel/watcher 2.6.0 (npm-pinned). The inspected release was published 2026-07-20 and supplies native recursive backends, coalesced events, ignores, Node-API v3, and prebuilt packages for the target architectures. Chokidar 6.0.0 is newer and more recently active, but requires Node >=22.22 versus the project's >=22.13 declaration and delivers a different normalization/batching tradeoff. Node fs.watch avoids a dependency but leaves more filtering/event handling to the application. The real @vscode/watcher fork had no established advantage over the selected upstream release. Registry and upstream evidence: https://registry.npmjs.org/@parcel/watcher , https://registry.npmjs.org/chokidar , https://registry.npmjs.org/@vscode/watcher , https://github.com/parcel-bundler/watcher/tree/v2.6.0 . No alternative removes Linux watch limits or special-filesystem limitations.

Implementation uses the SDK's existing object channels, not a new host protocol. Mounted consumers share a directory watch; retained UI intent does not own subscriptions or loaded status/tree data. Presence-based effect cleanup also stops work when an island begins exiting. Metadata and worktree events are payload-free invalidations; authoritative state comes from subsequent reads. Background agents and unopened sessions do not acquire watches. Full patches are read only for open diffs; tracked patches use Git's own attribute/EOL/file-mode semantics. Final symlinks are read as link entries, with parent traversal confined; ordinary content read/write authorization is unchanged.

A review found and prompted fixes for a deferred-cleanup handoff leak, retained Changes decorations after pause, orphaned diff islands after resource removal, and final-symlink validation. An explicit object-presence subscription closes transient diff islands on removal. Initial reads, manual refresh, and visible failure states remain; there are no tool-completion triggers, polling, checkpoint, staging, or commit features.

Validation covers typechecks, focused deterministic filesystem/model/diff/event-filter tests, bilingual message checks, and the production build. GUI interaction remains for user acceptance. Native notifications and packaged behavior on Windows/Linux were not exercised locally; no cross-platform runtime guarantee or measured repository-scan performance is claimed.


Before commit, a user-requested simplification pass removed duplicated change-list state, unused watch-error message transport/conversion, duplicate untracked-text decoding, and a redundant host-bundler external declaration. Changes model ownership is isolated to status-capable Directory views; Manual trees do not allocate or search a second model. Native package resolution remains declared at its owning plugin boundary. Lifecycle reference counting, cancellation, overlap filtering, path confinement, and metadata-only diff rendering were retained because they serve current execution paths.
