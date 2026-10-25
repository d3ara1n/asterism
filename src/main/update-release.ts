import { gt, rcompare, valid } from "semver";
import { z } from "zod";

export const githubReleasesSchema = z.array(z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
}));
export type GitHubUpdateRelease = z.infer<typeof githubReleasesSchema>[number];

/** GitHub 的发布标记决定可见范围，SemVer 决定更新顺序。 */
export function selectUpdateRelease(releases: GitHubUpdateRelease[], current: string, includePrerelease: boolean): GitHubUpdateRelease | null {
  return releases.filter(release => !release.draft && (includePrerelease || !release.prerelease) &&
    valid(release.tag_name) && gt(release.tag_name, current))
    .sort((a, b) => rcompare(a.tag_name, b.tag_name))[0] ?? null;
}
