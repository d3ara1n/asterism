import type { Configuration } from "electron-builder";
import { applicationBrand, applicationId, applicationRepository } from "./src/shared/application.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { verifyPackagedPlugins } from "./scripts/verify-package.ts";
import { pluginDistributionFiles } from "./scripts/plugin-distribution.ts";
import { testFileGlob } from "./src/shared/runtime-modules.ts";
import { runtimeImportsFile } from "./scripts/bundle-runtime-imports.ts";
import { builtinDirectory, releaseLayout } from "./scripts/release-layout.ts";

const layout = releaseLayout();
const config: Configuration = {
  appId: applicationId,
  productName: applicationBrand.en,
  directories: { output: "out", buildResources: "assets/icon" },
  files: [
    "dist/**/*", "package.json", "LICENSE", "THIRD_PARTY_NOTICES.md", `!**/${runtimeImportsFile}`, `!${testFileGlob}`, "!**/*.map",
    ...layout.exclusions,
    { from: builtinDirectory, to: builtinDirectory, filter: pluginDistributionFiles(builtinDirectory) },
    ...layout.manualFiles.map(file => ({ ...file, filter: ["**/*", "!**/node_modules{,/**}", "!**/dist{,/**}", `!${testFileGlob}`, "!**/*.map"] })),
  ],
  asarUnpack: layout.unpack,
  afterPack(context) {
    const resources = context.packager.getResourcesDir(context.appOutDir);
    verifyPackagedPlugins(join(resources, "app.asar"), layout.roots);
    for (const path of layout.physicalInputs)
      if (!existsSync(join(resources, "app.asar.unpacked", path))) throw new Error(`Missing unpacked runtime input: ${path}`);
  },
  extraResources: [{ from: "assets/icon/asterism-full.png", to: "asterism-full.png" }],
  artifactName: "Asterism-${os}-${arch}.${ext}",
  publish: { provider: "github", owner: applicationRepository.owner, repo: applicationRepository.name, channel: "latest" },
  mac: {
    target: ["dmg", "zip"],
    icon: "assets/icon/asterism.icns",
    category: "public.app-category.productivity",
    // CI imports the fixed self-signed identity; local builds without a certificate only validate ad-hoc packaging.
    identity: process.env.CSC_NAME ?? "-",
    hardenedRuntime: false,
    gatekeeperAssess: false,
    preAutoEntitlements: false,
    notarize: false,
  },
  dmg: { sign: false },
  win: { target: ["nsis"], icon: "assets/icon/asterism.ico", verifyUpdateCodeSignature: false },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false, differentialPackage: false, include: "scripts/windows/installer.nsh" },
  linux: { target: ["AppImage"], icon: "assets/icon/asterism.png", category: "Utility" },
};

export default config;
