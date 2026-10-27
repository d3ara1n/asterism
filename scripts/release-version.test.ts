import { describe, expect, it } from "vitest";
import { planRelease } from "./release-version.ts";
import { commitsAfter, hasReleasableChanges, parseCommit, parseGitLog, previousRelease, releaseNotes, type PublishedRelease, type ReleaseInput } from "./release-commits.ts";

const commit = (sha: string, message: string) => parseCommit(sha, message);
const released = (tag: string, sha: string, publishedAt = "2026-10-25T00:00:00Z"): PublishedRelease =>
  ({ tag, sha, prerelease: tag.includes("-"), publishedAt });
const root = commit("root", "feat: 初始功能");
const input = (patch: Partial<ReleaseInput> = {}): ReleaseInput => ({
  mode: "prerelease", repository: "example/app", sourceSha: "head", sourceTag: null,
  releases: [], commits: [root], ...patch,
});

// Expectations follow release rules: a fixed initial version, then cumulative changes along main's first-parent chain and release boundaries.
describe("Release versions driven by main commits", () => {
  it("ignores message version impact without tags and starts breaking or maintenance-only history at 0.1.0", () => {
    for (const message of ["feat!: 新协议", "fix: 修复", "ci: 发布流程"]) {
      const value = input({ commits: [commit("head", message)] });
      expect(hasReleasableChanges(value)).toBe(true);
      const plan = planRelease(value);
      expect(plan?.version).toBe("0.1.0-prerelease.1");
      expect(plan?.notes).toContain(message);
    }
  });
  it("counts only commits after the first tag so old breaking changes cannot make the second package jump to major", () => {
    const initial = commit("initial", "refactor!: 开发期重构");
    const releases = [released("v0.1.0-prerelease.1", initial.sha)];
    expect(planRelease(input({ releases, commits: [initial] }))).toBeNull();
    expect(planRelease(input({ releases, commits: [commit("head", "fix: 修复"), initial] }))?.version)
      .toBe("0.1.1-prerelease.1");
    expect(planRelease(input({ releases, commits: [commit("head", "feat: 新功能"), initial] }))?.version)
      .toBe("0.2.0-prerelease.1");
  });
  it("accumulates changes since the first tag before a stable release and increments prerelease numbers for the same target", () => {
    const initial = commit("initial", "feat!: 开发期功能");
    const first = commit("first", "feat: 新功能");
    expect(planRelease(input({
      releases: [released("v0.1.0-prerelease.1", initial.sha), released("v0.2.0-prerelease.1", first.sha)],
      commits: [commit("head", "fix: 修复"), first, initial],
    }))?.version).toBe("0.2.0-prerelease.2");
  });
  it("bumps minor once for multiple feats against one stable release, increments prerelease numbers numerically, and lists only new commits", () => {
    const first = commit("first", "feat: 编辑");
    const plan = planRelease(input({
      releases: [released("v1.0.0", root.sha), released("v1.1.0-prerelease.9", first.sha), released("v1.1.0-prerelease.2", first.sha)],
      commits: [commit("head", "feat: 搜索"), first, root],
    }));
    expect(plan?.version).toBe("1.1.0-prerelease.10");
    expect(plan?.notes).toContain("feat: 搜索");
    expect(plan?.notes).not.toContain("feat: 编辑");
  });
  it("changes the target and resets the sequence when cumulative changes reach feat or breaking", () => {
    const fix = commit("fix", "fix: 修复");
    const value = input({ releases: [released("v1.0.0", root.sha), released("v1.0.1-prerelease.2", fix.sha)],
      commits: [commit("head", "feat(ui): 新功能"), fix, root] });
    expect(planRelease(value)?.version).toBe("1.1.0-prerelease.1");
    value.commits.unshift(commit("breaking", "refactor(storage)!: 新格式"));
    expect(planRelease(value)?.version).toBe("2.0.0-prerelease.1");
  });
  it("maintenance-only commits after a release do not publish but appear in notes with the next qualifying change", () => {
    const value = input({ releases: [released("v1.0.0", root.sha)],
      commits: [commit("ci", "ci: 工作流"), commit("docs", "docs: 说明"), commit("chore", "chore: 整理"), root] });
    expect(hasReleasableChanges(value)).toBe(false);
    expect(planRelease(value)).toBeNull();
    value.commits.unshift(commit("head", "refactor: 优化实现"));
    const plan = planRelease(value);
    expect(plan?.version).toBe("1.0.1-prerelease.1");
    expect(plan?.notes).toContain("ci: 工作流");
    expect(plan?.notes).toContain("## Documentation");
    expect(plan?.notes).not.toContain("feat: 初始功能");
  });
  it("promotes the fixed candidate commit and lists all changes since the last stable release without later trunk development", () => {
    const first = commit("first", "feat: 功能");
    const selected = commit("selected", "fix: 修复");
    const preview = released("v1.1.0-prerelease.2", selected.sha);
    const plan = planRelease(input({ mode: "release", sourceTag: preview.tag, sourceSha: selected.sha,
      releases: [released("v1.0.0", root.sha), released("v1.1.0-prerelease.1", first.sha), preview, released("v2.0.0-prerelease.1", "later")],
      commits: [selected, first, root] }));
    expect(plan?.version).toBe("1.1.0");
    expect(plan?.sourceSha).toBe(selected.sha);
    expect(plan?.notes).toContain("feat: 功能");
    expect(plan?.notes).toContain("fix: 修复");
    expect(plan?.notes).not.toContain("初始功能");
    expect(plan?.notes).not.toContain("/commit/later");
    expect(plan?.notes).toContain("compare/v1.0.0...v1.1.0");
  });
  it("includes history before the initial release in the first stable notes even when excluded from version calculation", () => {
    const preview = released("v0.1.1-prerelease.1", "head");
    const plan = planRelease(input({ mode: "release", sourceTag: preview.tag, sourceSha: preview.sha,
      releases: [released("v0.1.0-prerelease.1", root.sha), preview],
      commits: [commit("head", "fix: 修复"), root] }));
    expect(plan?.version).toBe("0.1.1");
    expect(plan?.notes).toContain("feat: 初始功能");
    expect(plan?.notes).toContain("fix: 修复");
    expect(plan?.notes).toContain("/commits/v0.1.1");
  });
  it("establishes a new baseline after a stable release without recounting previous feats", () => {
    const stable = commit("stable", "feat: 已发布");
    expect(planRelease(input({ releases: [released("v0.1.0-prerelease.1", root.sha), released("v1.1.0", stable.sha)],
      commits: [commit("head", "fix: 修复"), stable, root] }))?.version).toBe("1.1.1-prerelease.1");
  });
  it("promotion requires a published candidate, its matching commit, and a version above the latest stable release", () => {
    const preview = released("v1.1.0-prerelease.1", "head");
    expect(() => planRelease(input({ mode: "release", sourceTag: "unknown" }))).toThrow("Select a published prerelease");
    expect(() => planRelease(input({ mode: "release", sourceTag: preview.tag, sourceSha: "different", releases: [preview] })))
      .toThrow("Select a published prerelease");
    expect(() => planRelease(input({ mode: "release", sourceTag: preview.tag, sourceSha: preview.sha,
      releases: [preview, released("v1.1.0", preview.sha)] }))).toThrow("newer than the latest stable");
  });
  it("rejects promotion of old code when a newer candidate has the same target so updated users do not receive a stable regression", () => {
    const older = released("v1.1.0-prerelease.1", root.sha);
    expect(() => planRelease(input({ mode: "release", sourceTag: older.tag, sourceSha: older.sha,
      releases: [older, released("v1.1.0-prerelease.2", "later")] }))).toThrow("newest prerelease for this target");
  });
});

// Ranges follow commit topology, not release time; parsing covers multiline Git messages and Conventional Commits.
describe("Commit parsing, ranges, and notes", () => {
  it("NUL separation preserves multiline bodies and shares type, breaking-marker, and category rules between squash and direct commits", () => {
    const commits = parseGitLog("squash\0feat(ui): 新功能 (#7)\n\n详细说明\n\0direct\0ci: 打包\n\0breaking\0refactor: 协议\n\nBREAKING CHANGE: 新协议\n\0");
    expect(commits.map(({ sha, subject, level, section }) => ({ sha, subject, level, section }))).toEqual([
      { sha: "squash", subject: "feat(ui): 新功能 (#7)", level: "minor", section: "Features" },
      { sha: "direct", subject: "ci: 打包", level: null, section: "Maintenance" },
      { sha: "breaking", subject: "refactor: 协议", level: "major", section: "Breaking Changes" },
    ]);
    expect(parseCommit("hyphen", "chore: 协议\n\nBREAKING-CHANGE: 新协议").level).toBe("major");
  });
  it("later promotion of an older commit does not retrigger already released commits closer to HEAD", () => {
    const latest = commit("latest", "feat: 下一版功能");
    const old = commit("old", "feat: 旧候选");
    const value = input({ releases: [released("v2.0.0-prerelease.1", latest.sha, "2026-10-24T00:00:00Z"),
      released("v1.0.0", old.sha, "2026-10-25T00:00:00Z")],
      commits: [commit("head", "docs: 说明"), latest, old, root] });
    expect(previousRelease(value)?.tag).toBe("v2.0.0-prerelease.1");
    expect(planRelease(value)).toBeNull();
    expect(commitsAfter(value.commits, latest.sha).map(commit => commit.sha)).toEqual(["head"]);
  });
  it("lists each SHA once, preserves uncategorized messages, and links entries directly to commits", () => {
    const feature = commit("abcdef123456", "feat!: 新协议 (#9)");
    const notes = releaseNotes([feature, feature, commit("other", "调整构建")], "example/app", null, "v0.1.0");
    expect(notes.match(/\[abcdef1\]/g)).toHaveLength(1);
    expect(notes).toContain("## Breaking Changes");
    expect(notes).toContain("## Maintenance");
    expect(notes).toContain("调整构建");
    expect(notes).toContain("/commit/abcdef123456");
    expect(notes).toContain("/commits/v0.1.0");
  });
  it("preserves exactly twenty entries without an omission notice", () => {
    const commits = Array.from({ length: 20 }, (_, index) => commit(`feature-${index}`, `feat: 功能 ${index}`));
    const notes = releaseNotes(commits, "example/app", null, "v0.1.0");
    expect(notes.split("\n").filter(line => line.startsWith("- "))).toHaveLength(20);
    expect(notes).toContain("/commit/feature-19)");
    expect(notes).not.toContain("more commit");
  });
  it.each([
    [21, "1 more commit"],
    [25, "5 more commits"],
  ])("keeps the newest twenty of %i entries per category, counts omissions after deduplication, and limits categories independently", (count, omission) => {
    const features = Array.from({ length: count }, (_, index) => commit(`feature-${index}`, `feat: 功能 ${index}`));
    const fixes = Array.from({ length: 21 }, (_, index) => commit(`fix-${index}`, `fix: 修复 ${index}`));
    const commits = [features[0]!, ...features, ...fixes];
    const notes = releaseNotes(commits, "example/app", "v1.0.0", "v1.1.0");
    const [featureSection, fixSection] = notes.split("## Bug Fixes");
    expect(featureSection!.match(/\/commit\/feature-\d+\)/g)).toEqual(
      Array.from({ length: 20 }, (_, index) => `/commit/feature-${index})`),
    );
    expect(featureSection).toContain(`… and ${omission}. See the Full Changelog below.`);
    expect(fixSection!.match(/\/commit\/fix-\d+\)/g)).toEqual(
      Array.from({ length: 20 }, (_, index) => `/commit/fix-${index})`),
    );
    expect(fixSection).toContain("… and 1 more commit. See the Full Changelog below.");
    expect(notes).toContain("**Full Changelog**: https://github.com/example/app/compare/v1.0.0...v1.1.0");
  });
});
