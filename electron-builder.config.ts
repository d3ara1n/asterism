import type { Configuration } from "electron-builder";
import { applicationBrand, applicationId, applicationRepository } from "./src/shared/application.ts";

const config: Configuration = {
  appId: applicationId,
  productName: applicationBrand.en,
  directories: { output: "out", buildResources: "assets/icon" },
  files: ["dist/**/*", "package.json", "LICENSE", "THIRD_PARTY_NOTICES.md"],
  asarUnpack: ["**/node_modules/{esbuild,@esbuild,node-pty,@vscode/ripgrep*}/**"],
  extraResources: [{ from: "assets/icon/atelier-full.png", to: "atelier-full.png" }],
  artifactName: "Atelier-${version}-${os}-${arch}.${ext}",
  publish: { provider: "github", owner: applicationRepository.owner, repo: applicationRepository.name, channel: "latest" },
  mac: {
    target: ["dmg", "zip"],
    icon: "assets/icon/atelier.icns",
    category: "public.app-category.productivity",
    // 固定自签身份由 CI 导入；本地无证书时仅作 ad-hoc 打包验证。
    identity: process.env.CSC_NAME ?? "-",
    hardenedRuntime: false,
    gatekeeperAssess: false,
    preAutoEntitlements: false,
    notarize: false,
  },
  dmg: { sign: false },
  win: { target: ["nsis"], icon: "assets/icon/atelier.ico", verifyUpdateCodeSignature: false },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false },
  linux: { target: ["AppImage"], icon: "assets/icon/atelier.png", category: "Utility" },
};

export default config;
