import { describe, expect, it } from "vitest";
import { parseCommit } from "./release-commits.ts";
import { planPackage, planPackages, type PackageInput } from "./release-packages.ts";

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

const managed = (name: string, published: PackageInput["published"], touched: string[] = [], dependencies?: string[]): PackageInput =>
  ({ directory: `packages/${name}`, name, published, touched,
    ...(dependencies ? { examples: [{ path: `packages/${name}/examples/package.json`, dependencies }] } : {}) });

describe("Release-aligned examples", () => {
  it("propagates generated pin changes through the catalog, patching each owner only once", () => {
    const commits = [commit("head", "feat: builder API"), commit("docs", "docs: example notes"), commit("base", "feat: initial")];
    const sdk = managed("sdk", { "2.5.4": "base" }, ["docs"], ["builder", "sdk"]);
    sdk.examples!.push({ path: "packages/sdk/examples/second/package.json", dependencies: ["builder"] });
    const plans = planPackages([
      managed("builder", { "1.3.0": "base" }, ["head"]), sdk,
      managed("api", { "3.2.0": "base" }, [], ["sdk", "api"]),
    ], commits, "prerelease");
    expect(plans).toMatchObject([
      { name: "builder", version: "1.4.0", publish: true },
      { name: "sdk", version: "2.5.5", publish: true,
        examples: ["packages/sdk/examples/package.json", "packages/sdk/examples/second/package.json"] },
      { name: "api", version: "3.2.1", publish: true },
    ]);
  });

  it("keeps the owner's direct minor bump instead of adding a derived patch", () => {
    const commits = [commit("head", "feat: new interfaces"), commit("base", "feat: initial")];
    expect(planPackages([
      managed("builder", { "1.3.0": "base" }, ["head"]),
      managed("sdk", { "2.5.4": "base" }, ["head"], ["builder", "sdk"]),
      managed("api", { "3.2.0": "base" }, [], ["sdk", "api"]),
    ], commits, "prerelease")).toMatchObject([
      { version: "1.4.0", publish: true },
      { version: "2.6.0", publish: true },
      { version: "3.2.1", publish: true },
    ]);
  });

  it.each([1, 2, 3])("resumes an exact candidate after %i catalog packages were published", publishedCount => {
    const commits = [commit("candidate", "feat: builder API"), commit("base", "feat: initial")];
    const builder = managed("builder", { "1.3.0": "base", "1.4.0": "candidate" }, ["candidate"]);
    const sdk = managed("sdk", { "2.5.4": "base" }, [], ["builder", "sdk"]);
    const api = managed("api", { "3.2.0": "base" }, [], ["sdk", "api"]);
    if (publishedCount >= 2) sdk.published["2.5.5"] = "candidate";
    if (publishedCount >= 3) api.published["3.2.1"] = "candidate";
    expect(planPackages([builder, sdk, api], commits, "prerelease")).toMatchObject([
      { version: "1.4.0", publish: false },
      { version: "2.5.5", publish: publishedCount < 2 },
      { version: "3.2.1", publish: publishedCount < 3 },
    ]);
    if (publishedCount === 3) expect(planPackages([builder, sdk, api], commits, "release")).toMatchObject([
      { version: "1.4.0", publish: false },
      { version: "2.5.5", publish: false },
      { version: "3.2.1", publish: false },
    ]);
  });

  it("compares against dependency publications at the owner baseline, not their latest registry version", () => {
    const commits = [commit("candidate", "chore: candidate"), commit("upstream", "fix: builder"),
      commit("owner", "feat: SDK"), commit("older", "feat: initial")];
    expect(planPackages([
      managed("builder", { "1.0.0": "older", "1.1.0": "owner", "1.1.1": "upstream", "2.0.0": "elsewhere" }),
      managed("sdk", { "2.5.4": "owner" }, [], ["builder", "sdk"]),
    ], commits, "prerelease")).toMatchObject([
      { version: "1.1.1", publish: false },
      { version: "2.5.5", publish: true },
    ]);
  });

  it("leaves an owner unchanged when its paired dependency versions still match, including older dependency sources", () => {
    const commits = [commit("candidate", "feat: application only"), commit("owner", "fix: SDK"),
      commit("dependency", "fix: builder"), commit("older", "feat: initial")];
    const inputs = [
      managed("builder", { "1.0.0": "older", "1.1.0": "dependency", "1.2.0": "elsewhere", "2.0.0-stage": "candidate" }),
      managed("sdk", { "2.5.3": "older", "2.5.4": "owner" }, ["owner"], ["builder", "sdk"]),
    ];
    for (const mode of ["prerelease", "release"] as const) expect(planPackages(inputs, commits, mode)).toMatchObject([
      { version: "1.1.0", publish: false },
      { version: "2.5.4", publish: false },
    ]);
  });

  it("does not treat a self-pin as an external change before or after publishing a direct bump", () => {
    const commits = [commit("candidate", "fix: example behavior"), commit("base", "feat: initial")];
    const sdk = managed("sdk", { "2.5.4": "base" }, ["candidate"], ["sdk"]);
    expect(planPackages([sdk], commits, "prerelease")).toMatchObject([{ version: "2.5.5", publish: true }]);
    sdk.published["2.5.5"] = "candidate";
    expect(planPackages([sdk], commits, "prerelease")).toMatchObject([{ version: "2.5.5", publish: false }]);
    expect(planPackages([sdk], commits, "release")).toMatchObject([{ version: "2.5.5", publish: false }]);
  });

  it("rejects promotion when an upstream publication left an example owner unpublished", () => {
    const commits = [commit("candidate", "fix: builder"), commit("base", "feat: initial")];
    expect(() => planPackages([
      managed("builder", { "1.3.0": "base", "1.3.1": "candidate" }, ["candidate"]),
      managed("sdk", { "2.5.4": "base" }, [], ["builder", "sdk"]),
    ], commits, "release")).toThrow("sdk has changes that its prerelease did not publish");
  });

  it("rejects a derived patch version already published from another source", () => {
    const commits = [commit("candidate", "fix: builder"), commit("base", "feat: initial")];
    expect(() => planPackages([
      managed("builder", { "1.3.0": "base", "1.3.1": "candidate" }, ["candidate"]),
      managed("sdk", { "2.5.4": "base", "2.5.5": "elsewhere" }, [], ["builder", "sdk"]),
    ], commits, "prerelease")).toThrow("sdk@2.5.5 is already published from another commit");
  });

  it("versions a new dependency pairing when the public package did not exist at the owner baseline", () => {
    const commits = [commit("candidate", "feat: builder"), commit("base", "feat: SDK")];
    expect(planPackages([
      managed("builder", { "1.0.0": "candidate" }),
      managed("sdk", { "2.5.4": "base" }, [], ["builder", "sdk"]),
    ], commits, "prerelease")).toMatchObject([
      { version: "1.0.0", publish: false }, { version: "2.5.5", publish: true },
    ]);
  });
});


it("rejects catalogue order that would miss an upstream generated version change", () => {
  const commits = [commit("head", "fix: builder"), commit("base", "feat: initial")];
  expect(() => planPackages([
    managed("sdk", { "2.0.0": "base" }, [], ["builder"]),
    managed("builder", { "1.0.0": "base" }, ["head"]),
  ], commits, "prerelease")).toThrow("must precede sdk");
});
