import { describe, expect, it } from "vitest";
import { parseCommit } from "./release-commits.ts";
import { planPackage, type PackageInput } from "./release-packages.ts";

const commit = (sha: string, message: string) => parseCommit(sha, message);
const pkg = (published: PackageInput["published"], touched: string[]): PackageInput =>
  ({ directory: "packages/sdk", name: "@example/sdk", published, touched });

// Expectations follow the package rules: path-selected commits, application commit levels, and the nearest published source commit.
describe("Plugin package versions", () => {
  it("reuses the published version when application-only or maintenance-only commits follow it", () => {
    const commits = [commit("theme", "feat(ui): 新配色"), commit("docs", "docs: SDK 说明"), commit("base", "feat: 发布")];
    expect(planPackage(pkg({ "0.47.0": "base" }, ["docs"]), commits, "prerelease"))
      .toMatchObject({ version: "0.47.0", publish: false });
  });
  it("applies the highest level of touching commits once, independent of commit scope", () => {
    const commits = [commit("fix", "fix: 修复"), commit("other", "feat!: 应用格式"), commit("feat", "feat(plugins): 新接口"),
      commit("base", "feat: 发布")];
    expect(planPackage(pkg({ "0.47.0": "base" }, ["fix", "feat"]), commits, "prerelease"))
      .toMatchObject({ version: "0.48.0", publish: true });
    expect(planPackage(pkg({ "0.47.0": "base" }, ["fix", "other"]), commits, "prerelease").version).toBe("1.0.0");
  });
  it("selects the nearest publication on the source history so promotion and retries reuse their published version", () => {
    const commits = [commit("candidate", "fix: 修复"), commit("base", "feat: 发布")];
    const published = { "0.0.0-stage": null, "0.47.0": "base", "0.47.1": "candidate", "0.48.0": "later" };
    expect(planPackage(pkg(published, ["candidate"]), commits, "release")).toMatchObject({ version: "0.47.1", publish: false });
    expect(planPackage(pkg(published, ["candidate"]), commits, "prerelease")).toMatchObject({ version: "0.47.1", publish: false });
  });
  it("rejects missing baselines, unpublished changes during promotion, and versions taken by another commit", () => {
    const commits = [commit("head", "feat: 新接口"), commit("base", "feat: 发布")];
    expect(() => planPackage(pkg({ "0.0.0-stage": "base", "0.47.0": "elsewhere" }, []), commits, "prerelease"))
      .toThrow("no publication on the source history");
    expect(() => planPackage(pkg({ "0.47.0": "base" }, ["head"]), commits, "release")).toThrow("did not publish");
    expect(() => planPackage(pkg({ "0.47.0": "base", "0.48.0": "elsewhere" }, ["head"]), commits, "prerelease"))
      .toThrow("already published");
  });
});
