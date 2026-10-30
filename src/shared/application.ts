import packageMetadata from "../../package.json" with { type: "json" };

/** Centralized public branding; system identity stays stable after user distribution and does not follow display-name changes. */
export const applicationId = "dev.dearain.asterism";
export const applicationBrand = { en: "Asterism", zh: "星图" } as const;
export const applicationSlug = "asterism";
export const applicationRepository = { owner: "d3ara1n", name: "asterism" } as const;
export const applicationVersion = packageMetadata.version;
/** Built-in model calls declare the actual app identity; third-party callers may supply their own UA. */
export const applicationUserAgent = `${applicationBrand.en}/${applicationVersion}`;

/** Data roots use fixed identity with explicit development/release isolation; callers resolve under Electron appData. */
export function applicationDataDirectory(isPackaged: boolean): string {
  return isPackaged ? applicationId : `${applicationId}.dev`;
}

/** Fixed layout within one application data root; filenames do not follow brand display names. */
export const applicationStorage = {
  shellIntegrationDirectory: "shell-integration",
  databaseDirectory: "db",
  databaseFile: "workspace.sqlite",
  contentDirectory: "content",
  credentialsDirectory: "credentials",
  configurationFile: "configuration.json",
  appearanceStore: "appearance",
  languageStore: "language",
  uiStateStore: "ui-state",
  updatesStore: "updates",
  networkStore: "network",
  chromiumDirectory: "chromium",
  logsDirectory: "logs",
  recoveryDirectory: "recovery",
  runtimeLogFile: "runtime.log",
} as const;

/** Flat format version for main-process preference files; electron-store writes defaults with new files. UI state is an unversioned cache. */
export const preferenceVersion = 1;

/** Archived-session retention period, checked only during startup cleanup rather than scheduled work; the UI describes it as about a month. */
export const sessionRetentionMs = 30 * 24 * 60 * 60 * 1000;
