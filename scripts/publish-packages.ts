import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { registryPublished, releasePackages } from "./release-registry.ts";

// `version` writes computed versions into the checkout; `publish` publishes prerelease packages to `next` or moves `latest` on promotion.
const command = process.argv[2];
const plans = releasePackages();
if (command === "version") {
  for (const plan of plans) {
    const file = join(plan.directory, "package.json");
    const metadata = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, `${JSON.stringify({ ...metadata, version: plan.version }, null, 2)}\n`);
    console.log(`${plan.name} version ${plan.version}`);
  }
} else if (command === "publish") {
  const npm = (...args: string[]) => execFileSync("npm", args, { stdio: "inherit" });
  const prerelease = process.env.RELEASE_PRERELEASE === "true";
  for (const plan of plans) {
    if (!prerelease) {
      npm("dist-tag", "add", `${plan.name}@${plan.version}`, "latest");
    } else if (!plan.publish) {
      console.log(`${plan.name}@${plan.version} is unchanged.`);
    } else if (plan.version in await registryPublished(plan.name)) {
      // Re-running a failed publish job reuses its plan; earlier packages may already be on npm.
      console.log(`${plan.name}@${plan.version} is already published.`);
    } else {
      npm("publish", "--workspace", plan.directory, "--tag", "next");
    }
  }
} else {
  throw new Error("Expected version or publish.");
}
