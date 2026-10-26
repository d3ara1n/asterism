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

// 预期来自发布规则：首次固定版本，随后按 main 第一父链的累计变更与发布边界计算。
describe("main 提交驱动的发布版本", () => {
  it("没有 tag 时忽略所有消息的版本影响，破坏性或纯维护历史都以 0.1.0 起步", () => {
    for (const message of ["feat!: 新协议", "fix: 修复", "ci: 发布流程"]) {
      const value = input({ commits: [commit("head", message)] });
      expect(hasReleasableChanges(value)).toBe(true);
      const plan = planRelease(value);
      expect(plan?.version).toBe("0.1.0-prerelease.1");
      expect(plan?.notes).toContain(message);
    }
  });
  it("首个 tag 后只计算新增提交，旧的破坏性提交不会使第二包跳到 major", () => {
    const initial = commit("initial", "refactor!: 开发期重构");
    const releases = [released("v0.1.0-prerelease.1", initial.sha)];
    expect(planRelease(input({ releases, commits: [initial] }))).toBeNull();
    expect(planRelease(input({ releases, commits: [commit("head", "fix: 修复"), initial] }))?.version)
      .toBe("0.1.1-prerelease.1");
    expect(planRelease(input({ releases, commits: [commit("head", "feat: 新功能"), initial] }))?.version)
      .toBe("0.2.0-prerelease.1");
  });
  it("正式版前仍累计首个 tag 后的变更，同目标继续增长预发布序号", () => {
    const initial = commit("initial", "feat!: 开发期功能");
    const first = commit("first", "feat: 新功能");
    expect(planRelease(input({
      releases: [released("v0.1.0-prerelease.1", initial.sha), released("v0.2.0-prerelease.1", first.sha)],
      commits: [commit("head", "fix: 修复"), first, initial],
    }))?.version).toBe("0.2.0-prerelease.2");
  });
  it("多个 feat 相对同一正式版只升一次 minor，预发布序号按数值递增且说明只列新提交", () => {
    const first = commit("first", "feat: 编辑");
    const plan = planRelease(input({
      releases: [released("v1.0.0", root.sha), released("v1.1.0-prerelease.9", first.sha), released("v1.1.0-prerelease.2", first.sha)],
      commits: [commit("head", "feat: 搜索"), first, root],
    }));
    expect(plan?.version).toBe("1.1.0-prerelease.10");
    expect(plan?.notes).toContain("feat: 搜索");
    expect(plan?.notes).not.toContain("feat: 编辑");
  });
  it("累计变更提升为 feat 或 breaking 时，更换目标并重置序号", () => {
    const fix = commit("fix", "fix: 修复");
    const value = input({ releases: [released("v1.0.0", root.sha), released("v1.0.1-prerelease.2", fix.sha)],
      commits: [commit("head", "feat(ui): 新功能"), fix, root] });
    expect(planRelease(value)?.version).toBe("1.1.0-prerelease.1");
    value.commits.unshift(commit("breaking", "refactor(storage)!: 新格式"));
    expect(planRelease(value)?.version).toBe("2.0.0-prerelease.1");
  });
  it("已有发布后纯维护提交不触发发包，维护条目随下次有效变更进入说明", () => {
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
  it("晋级固定候选提交，说明覆盖上个正式版以来所有提交而不带入主干后续开发", () => {
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
  it("首次正式说明包含初始发布前的历史，即使该历史未参与版本计算", () => {
    const preview = released("v0.1.1-prerelease.1", "head");
    const plan = planRelease(input({ mode: "release", sourceTag: preview.tag, sourceSha: preview.sha,
      releases: [released("v0.1.0-prerelease.1", root.sha), preview],
      commits: [commit("head", "fix: 修复"), root] }));
    expect(plan?.version).toBe("0.1.1");
    expect(plan?.notes).toContain("feat: 初始功能");
    expect(plan?.notes).toContain("fix: 修复");
    expect(plan?.notes).toContain("/commits/v0.1.1");
  });
  it("有正式版后重新建立计算基线，不重复计算之前的 feat", () => {
    const stable = commit("stable", "feat: 已发布");
    expect(planRelease(input({ releases: [released("v0.1.0-prerelease.1", root.sha), released("v1.1.0", stable.sha)],
      commits: [commit("head", "fix: 修复"), stable, root] }))?.version).toBe("1.1.1-prerelease.1");
  });
  it("晋级须使用已发布候选、对应提交且高于最新正式版", () => {
    const preview = released("v1.1.0-prerelease.1", "head");
    expect(() => planRelease(input({ mode: "release", sourceTag: "unknown" }))).toThrow("Select a published prerelease");
    expect(() => planRelease(input({ mode: "release", sourceTag: preview.tag, sourceSha: "different", releases: [preview] })))
      .toThrow("Select a published prerelease");
    expect(() => planRelease(input({ mode: "release", sourceTag: preview.tag, sourceSha: preview.sha,
      releases: [preview, released("v1.1.0", preview.sha)] }))).toThrow("newer than the latest stable");
  });
  it("同目标已有新候选时拒绝晋级旧代码，避免更新后的用户收到功能倒退的正式版", () => {
    const older = released("v1.1.0-prerelease.1", root.sha);
    expect(() => planRelease(input({ mode: "release", sourceTag: older.tag, sourceSha: older.sha,
      releases: [older, released("v1.1.0-prerelease.2", "later")] }))).toThrow("newest prerelease for this target");
  });
});

// 范围来自提交拓扑而非发布时刻；解析覆盖 git 的多行消息与 Conventional Commits 格式。
describe("提交解析、范围与说明", () => {
  it("NUL 分隔保留多行正文，squash 和直接提交共用类型、破坏性标记与分类规则", () => {
    const commits = parseGitLog("squash\0feat(ui): 新功能 (#7)\n\n详细说明\n\0direct\0ci: 打包\n\0breaking\0refactor: 协议\n\nBREAKING CHANGE: 新协议\n\0");
    expect(commits.map(({ sha, subject, level, section }) => ({ sha, subject, level, section }))).toEqual([
      { sha: "squash", subject: "feat(ui): 新功能 (#7)", level: "minor", section: "Features" },
      { sha: "direct", subject: "ci: 打包", level: null, section: "Maintenance" },
      { sha: "breaking", subject: "refactor: 协议", level: "major", section: "Breaking Changes" },
    ]);
    expect(parseCommit("hyphen", "chore: 协议\n\nBREAKING-CHANGE: 新协议").level).toBe("major");
  });
  it("较旧提交后来晋级不会让更靠近 HEAD 的已发布提交再次触发", () => {
    const latest = commit("latest", "feat: 下一版功能");
    const old = commit("old", "feat: 旧候选");
    const value = input({ releases: [released("v2.0.0-prerelease.1", latest.sha, "2026-10-24T00:00:00Z"),
      released("v1.0.0", old.sha, "2026-10-25T00:00:00Z")],
      commits: [commit("head", "docs: 说明"), latest, old, root] });
    expect(previousRelease(value)?.tag).toBe("v2.0.0-prerelease.1");
    expect(planRelease(value)).toBeNull();
    expect(commitsAfter(value.commits, latest.sha).map(commit => commit.sha)).toEqual(["head"]);
  });
  it("每个 SHA 只列一次，未分类消息保留，条目链接直接指向提交", () => {
    const feature = commit("abcdef123456", "feat!: 新协议 (#9)");
    const notes = releaseNotes([feature, feature, commit("other", "调整构建")], "example/app", null, "v0.1.0");
    expect(notes.match(/\[abcdef1\]/g)).toHaveLength(1);
    expect(notes).toContain("## Breaking Changes");
    expect(notes).toContain("## Maintenance");
    expect(notes).toContain("调整构建");
    expect(notes).toContain("/commit/abcdef123456");
    expect(notes).toContain("/commits/v0.1.0");
  });
});
