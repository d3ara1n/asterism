/** 对外品牌集中于此；系统身份发布后保持稳定，不随显示名称变动。 */
export const applicationId = "dev.dearain.atelier";
export const applicationBrand = { en: "Atelier", zh: "工坊" } as const;
export const applicationSlug = "atelier";

/** 数据根使用固定身份，开发与发布显式隔离；调用方在 Electron appData 下解析。 */
export function applicationDataDirectory(isPackaged: boolean): string {
  return isPackaged ? applicationId : `${applicationId}-development`;
}

/** 同一应用数据根下的固定布局，不以品牌显示名命名文件。 */
export const applicationStorage = {
  databaseDirectory: "db",
  databaseFile: "workspace.sqlite",
  objectsDirectory: "objects",
  contentDirectory: "content",
  credentialsDirectory: "credentials",
  configurationFile: "configuration.json",
  appearanceStore: "appearance",
  languageStore: "language",
  uiStateStore: "ui-state",
  chromiumDirectory: "chromium",
  logsDirectory: "logs",
  runtimeLogFile: "runtime.log",
} as const;
