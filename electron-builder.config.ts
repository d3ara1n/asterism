import type { Configuration } from "electron-builder";
import { applicationBrand, applicationId, applicationRepository } from "./src/shared/application.ts";
import { join } from "node:path";
import { verifyPackagedPlugins } from "./scripts/verify-package.ts";
import { pluginDistributionFiles } from "./scripts/plugin-distribution.ts";
import { testFileGlob } from "./src/shared/runtime-modules.ts";

const config: Configuration = {
  appId: applicationId,
  productName: applicationBrand.en,
  directories: { output: "out", buildResources: "assets/icon" },
  files: [
    "dist/**/*", "package.json", "LICENSE", "THIRD_PARTY_NOTICES.md", "!node_modules/@asterism-app/builtin/dist{,/**}", "!node_modules/@asterism-app/{sdk,builtin-api}/examples/**/dist{,/**}", `!${testFileGlob}`, "!**/*.map",
    // Explicit directory mappings preserve example declarations that the default application filter excludes.
    ...["docs/manual", ...["sdk", "ui", "builtin-api"].map(name => `packages/${name}`)]
      .map(path => ({ from: path, to: path, filter: ["**/*", "!**/node_modules{,/**}", "!**/dist{,/**}", `!${testFileGlob}`, "!**/*.map"] })),
    { from: "packages/builtin", to: "packages/builtin", filter: pluginDistributionFiles("packages/builtin") },
    { from: "packages/plugin-build", to: "packages/plugin-build", filter: ["package.json", "docs/**"] },
    // Public libraries resolve through node_modules, whose default dependency filter omits examples.
    ...["sdk", "builtin-api"].flatMap(name => ["docs", "examples"].map(directory => ({
      from: `packages/${name}/${directory}`, to: `node_modules/@asterism-app/${name}/${directory}`, filter: ["**/*", "!**/dist{,/**}", `!${testFileGlob}`, "!**/*.map"],
    }))),
  ],
  asarUnpack: ["docs/manual/**", "packages/**", "node_modules/**"],
  afterPack(context) {
    verifyPackagedPlugins(join(context.packager.getResourcesDir(context.appOutDir), "app.asar.unpacked"));
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
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false, differentialPackage: false },
  linux: { target: ["AppImage"], icon: "assets/icon/asterism.png", category: "Utility" },
};

export default config;
