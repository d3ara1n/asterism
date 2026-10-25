import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerZIP } from "@electron-forge/maker-zip";
import { applicationBrand, applicationId } from "./src/shared/application.ts";

const config: ForgeConfig = {
  packagerConfig: {
    // 原生模块及其平台辅助程序在 asar 外加载、执行。
    asar: { unpack: "**/node_modules/{esbuild,@esbuild,node-pty,@vscode/ripgrep*}/**" },
    // 打包器以可执行文件名生成 macOS 显示名，统一使用正式品牌大小写。
    executableName: applicationBrand.en,
    name: applicationBrand.en,
    appBundleId: applicationId,
    // electron-vite 已完成构建；包只含运行产物、清单与生产依赖。
    ignore: (path) => !!path && !/^\/(dist|node_modules)(\/|$)/.test(path) && !["/package.json", "/THIRD_PARTY_NOTICES.md"].includes(path),
  },
  makers: [new MakerZIP({}, ["darwin", "win32", "linux"])],
};
export default config;
