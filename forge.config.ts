import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerZIP } from "@electron-forge/maker-zip";
import { applicationId } from "./src/shared/desktop.ts";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: "weft",
    name: "Weft",
    appBundleId: applicationId,
    // electron-vite 已完成构建；包只含运行产物、清单与生产依赖。
    ignore: (path) => !!path && !/^\/(dist|node_modules)(\/|$)/.test(path) && !["/package.json", "/THIRD_PARTY_NOTICES.md"].includes(path),
  },
  makers: [new MakerZIP({}, ["darwin", "win32", "linux"])],
};
export default config;
