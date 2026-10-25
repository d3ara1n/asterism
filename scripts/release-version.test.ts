import { describe, expect, it } from "vitest";
import { planRelease } from "./release-version.ts";
import { pullRequestsInHistory, releaseNotes, type PublishedRelease, type ReleaseInput, type ReleasePullRequest } from "./release-prs.ts";

const pr = (number: number, title: string): ReleasePullRequest => ({ number, title, mergeCommit: `commit-${number}`, url: `https://github.com/example/app/pull/${number}`, author: "author" });
const released = (tag: string, pullRequests: number[] = [], preview = tag.includes("-")): PublishedRelease =>
  ({ tag, pullRequests, prerelease: preview, sha: `sha-${tag}`, publishedAt: "2026-10-25T00:00:00Z" });
const input = (patch: Partial<ReleaseInput> = {}): ReleaseInput => ({
  mode: "prerelease", repository: "example/app", sourceSha: "head", sourceTag: null,
  releases: [], pullRequests: [], previousTag: null, newPullRequests: [], ...patch,
});

describe("PR 驱动的发布版本", () => {
  it("首次发布从零基线按 PR 计算，个人零散提交不另外触发", () => {
    expect(planRelease(input({ pullRequests: [pr(1, "feat: 工作台")], newPullRequests: [1] }))?.version).toBe("0.1.0-prerelease.1");
    expect(planRelease(input())).toBeNull();
  });
  it("多个 feat 相对同一个正式版只升一次 minor，预发布序号按数值递增", () => {
    const plan = planRelease(input({
      releases: [released("v1.0.0"), released("v1.1.0-prerelease.9", [1]), released("v1.1.0-prerelease.2", [1])],
      pullRequests: [pr(1, "feat: 编辑"), pr(2, "feat: 搜索")], newPullRequests: [2], previousTag: "v1.1.0-prerelease.9",
    }));
    expect(plan?.version).toBe("1.1.0-prerelease.10");
    expect(plan?.notes).toContain("[#2]");
    expect(plan?.notes).not.toContain("[#1]");
  });
  it("累计变更从 fix 提升到 feat 或破坏性变更时，更换目标并重置序号", () => {
    const patch = input({ releases: [released("v1.0.0"), released("v1.0.1-prerelease.2", [1])],
      pullRequests: [pr(1, "fix: 修复"), pr(2, "feat(ui): 新功能")], newPullRequests: [2] });
    expect(planRelease(patch)?.version).toBe("1.1.0-prerelease.1");
    patch.pullRequests.push(pr(3, "refactor(storage)!: 新格式"));
    patch.newPullRequests.push(3);
    expect(planRelease(patch)?.version).toBe("2.0.0-prerelease.1");
  });
  it("已发布功能不使只有 docs、chore、ci 的后续周次再次发包", () => {
    expect(planRelease(input({ releases: [released("v1.0.0"), released("v1.1.0-prerelease.1", [1])],
      pullRequests: [pr(1, "feat: 新功能"), pr(2, "docs: 说明"), pr(3, "chore: 整理"), pr(4, "ci: 工作流")],
      newPullRequests: [2, 3, 4] }))).toBeNull();
  });
  it("refactor 触发 patch，维护 PR 随同有效发布进入说明", () => {
    const plan = planRelease(input({ releases: [released("v1.0.0", [1])],
      pullRequests: [pr(1, "feat: 上版功能"), pr(2, "refactor: 优化实现"), pr(3, "docs: 使用说明")], newPullRequests: [2, 3] }));
    expect(plan?.version).toBe("1.0.1-prerelease.1");
    expect(plan?.notes).toContain("## Documentation");
    expect(plan?.notes).not.toContain("上版功能");
  });
  it("晋级固定所选预发布提交，正式说明覆盖中间所有预发布的 PR", () => {
    const stable = released("v1.0.0", [1]);
    const first = released("v1.1.0-prerelease.1", [1, 2]);
    const selected = released("v1.1.0-prerelease.2", [1, 2, 3]);
    const later = released("v2.0.0-prerelease.1", [1, 2, 3, 4]);
    const plan = planRelease(input({ mode: "release", sourceTag: selected.tag, sourceSha: selected.sha,
      releases: [stable, first, selected, later], pullRequests: [pr(1, "feat: 旧版"), pr(2, "feat: 功能"), pr(3, "fix: 修复")],
      previousTag: selected.tag, newPullRequests: [] }));
    expect(plan?.version).toBe("1.1.0");
    expect(plan?.sourceSha).toBe(selected.sha);
    expect(plan?.notes).toContain("[#2]");
    expect(plan?.notes).toContain("[#3]");
    expect(plan?.notes).not.toContain("[#1]");
    expect(plan?.notes).not.toContain("[#4]");
    expect(plan?.notes).toContain("compare/v1.0.0...v1.1.0");
  });
  it("正式版之后重新计算累计范围，不重复计算之前的 feat", () => {
    expect(planRelease(input({ releases: [released("v1.1.0", [1])],
      pullRequests: [pr(1, "feat: 已发布"), pr(2, "fix: 修复")], newPullRequests: [2] }))?.version).toBe("1.1.1-prerelease.1");
  });
  it("晋级只接受真实的预发布且正式版单调增长", () => {
    const preview = released("v1.1.0-prerelease.1");
    expect(() => planRelease(input({ mode: "release", sourceTag: "unknown" }))).toThrow("Select a published prerelease");
    expect(() => planRelease(input({ mode: "release", sourceTag: preview.tag, sourceSha: preview.sha,
      releases: [preview, released("v1.1.0")] }))).toThrow("newer than the latest stable");
  });
  it("同目标已有更新预发布时拒绝晋级旧代码，避免较新预发布用户收到功能倒退的正式版", () => {
    const older = released("v1.1.0-prerelease.1", [1]);
    expect(() => planRelease(input({ mode: "release", sourceTag: older.tag, sourceSha: older.sha,
      releases: [older, released("v1.1.0-prerelease.2", [1, 2])] }))).toThrow("newest prerelease for this target");
  });
});

describe("PR 发布范围与说明", () => {
  it("按目标提交的祖先过滤，排除后来合入 main 的 PR 和重复关联", () => {
    const first = pr(1, "feat: 已验证功能");
    expect(pullRequestsInHistory([first, pr(2, "feat: 后续开发"), first], ["root", first.mergeCommit])).toEqual([first]);
  });
  it("同一 PR 只出现一次，首次正式发布使用完整提交历史链接", () => {
    const first = pr(1, "feat!: 新协议");
    const notes = releaseNotes([first, first], "example/app", null, "v1.0.0");
    expect(notes.match(/\[#1\]/g)).toHaveLength(1);
    expect(notes).toContain("## Breaking Changes");
    expect(notes).toContain("/commits/v1.0.0");
  });
});
