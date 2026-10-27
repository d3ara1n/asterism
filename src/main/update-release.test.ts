import { describe, expect, it } from "vitest";
import { selectUpdateRelease } from "./update-release.ts";

const release = (tag_name: string, prerelease = false, draft = false) => ({ tag_name, html_url: `https://example.com/${tag_name}`, prerelease, draft });

describe("Update candidate selection", () => {
  it("the prerelease toggle controls GitHub flags, allowing stable-to-prerelease updates and subsequent stable releases", () => {
    const preview = release("v1.1.0-prerelease.8", true);
    expect(selectUpdateRelease([preview, release("v1.0.0")], "1.0.0", false)).toBeNull();
    expect(selectUpdateRelease([preview, release("v1.0.0")], "1.0.0", true)).toEqual(preview);
    expect(selectUpdateRelease([preview, release("v1.1.0")], "1.1.0-prerelease.8", true)?.tag_name).toBe("v1.1.0");
  });
  it("disabling prereleases never downgrades and reports no update when no stable release exists", () => {
    expect(selectUpdateRelease([release("v1.0.0"), release("v1.1.0-prerelease.8", true)], "1.1.0-prerelease.8", false)).toBeNull();
    expect(selectUpdateRelease([release("v0.1.0-prerelease.1", true)], "0.1.0-prerelease.1", false)).toBeNull();
  });
  it("selects by version so later promotion of an older candidate cannot hide a higher prerelease", () => {
    expect(selectUpdateRelease([release("v1.1.0"), release("v1.2.0-prerelease.2", true)], "1.1.0-prerelease.3", true)?.tag_name)
      .toBe("v1.2.0-prerelease.2");
  });
  it("unpublished drafts and non-software-version tags are excluded from update candidates", () => {
    expect(selectUpdateRelease([release("v9.0.0", false, true), release("docs"), release("v1.0.1")], "1.0.0", true)?.tag_name).toBe("v1.0.1");
  });
});
