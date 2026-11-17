import { execFileSync } from "node:child_process";
import { registryPublished, releasePackages, needsPackagePublication } from "./release-registry.ts";

import { writeReleaseVersions } from "./release-manifests.ts";

// `version` writes computed versions into the checkout; `publish` publishes prerelease packages to `next` or moves `latest` on promotion.
const command = process.argv[2];
const plans = releasePackages();
if (command === "version") {
  writeReleaseVersions(process.cwd(), plans);
} else if (command === "publish") {
  const npm = (...args: string[]) => execFileSync("npm", args, { stdio: "inherit" });
  const prerelease = process.env.RELEASE_PRERELEASE === "true";
  const sourceSha = process.env.RELEASE_SOURCE_SHA;
  if (prerelease && plans.some(plan => plan.publish) && !sourceSha) throw new Error("RELEASE_SOURCE_SHA is required to publish package artifacts.");
  for (const plan of plans) {
    if (!prerelease) {
      npm("dist-tag", "add", `${plan.name}@${plan.version}`, "latest");
    } else if (!plan.publish) {
      console.log(`${plan.name}@${plan.version} is unchanged.`);
    } else if (!needsPackagePublication(plan.name, plan.version, await registryPublished(plan.name), sourceSha!)) {
      // Re-running a failed publish job reuses its plan; earlier packages may already be on npm.
      console.log(`${plan.name}@${plan.version} is already published.`);
    } else {
      npm("publish", "--workspace", plan.directory, "--tag", "next");
    }
  }
} else {
  throw new Error("Expected version or publish.");
}
