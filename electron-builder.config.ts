import type { Configuration } from "electron-builder";
import { applicationBrand, applicationId, applicationRepository } from "./src/shared/application.ts";

const config: Configuration = {
  appId: applicationId,
  productName: applicationBrand.en,
  directories: { output: "out", buildResources: "assets/icon" },
  files: [
    "dist/**/*", "package.json", "LICENSE", "THIRD_PARTY_NOTICES.md",
    // Explicit directory mappings preserve example declarations that the default application filter excludes.
    ...["docs/manual", ...["sdk", "builtin-api"].flatMap(name => ["docs", "examples"].map(directory => `packages/${name}/${directory}`))]
      .map(path => ({ from: path, to: path, filter: ["**/*", "!**/node_modules{,/**}"] })),
  ],
  asarUnpack: ["docs/manual/**", "packages/{sdk,builtin-api}/{docs,examples}/**", "**/node_modules/{esbuild,@esbuild,node-pty,@vscode/ripgrep*}/**"],
  extraResources: [{ from: "assets/icon/asterism-full.png", to: "asterism-full.png" }],
  artifactName: "Asterism-${version}-${os}-${arch}.${ext}",
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
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false },
  linux: { target: ["AppImage"], icon: "assets/icon/asterism.png", category: "Utility" },
};

export default config;
