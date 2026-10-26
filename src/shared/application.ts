import packageMetadata from "../../package.json" with { type: "json" };

/** 对外品牌集中于此；系统身份面向用户分发后保持稳定，不随显示名称变动。 */
export const applicationId = "dev.dearain.asterism";
export const applicationBrand = { en: "Asterism", zh: "星图" } as const;
export const applicationSlug = "asterism";
export const applicationRepository = { owner: "d3ara1n", name: "asterism" } as const;
/** 内置模型调用声明真实应用身份；第三方调用方可提供自己的 UA。 */
export const applicationUserAgent = `${applicationBrand.en}/${packageMetadata.version}`;

/** 数据根使用固定身份，开发与发布显式隔离；调用方在 Electron appData 下解析。 */
export function applicationDataDirectory(isPackaged: boolean): string {
  return isPackaged ? applicationId : `${applicationId}.dev`;
}

/** 同一应用数据根下的固定布局，不以品牌显示名命名文件。 */
export const applicationStorage = {
  databaseDirectory: "db",
  databaseFile: "workspace.sqlite",
  contentDirectory: "content",
  credentialsDirectory: "credentials",
  configurationFile: "configuration.json",
  appearanceStore: "appearance",
  languageStore: "language",
  uiStateStore: "ui-state",
  updatesStore: "updates",
  chromiumDirectory: "chromium",
  logsDirectory: "logs",
  recoveryDirectory: "recovery",
  runtimeLogFile: "runtime.log",
} as const;

/** 主进程设置文件（外观、语言、更新）的平铺格式版本；electron-store 默认值随新文件写入。界面状态是缓存，不带版本。 */
export const preferenceVersion = 1;

/** 归档会话的冷静期；仅在启动清理时判定，不是定时任务，界面只表达为约一个月。 */
export const sessionRetentionMs = 30 * 24 * 60 * 60 * 1000;
