import { pathWithin } from "../storage/paths.ts";
import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, net, protocol, session, shell } from "electron";
import { randomUUID } from "node:crypto";
import { externalWebUrl } from "@asterism-app/ui/links";
import { mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pickDirectoryChannel, openLocalFileChannel, openLogsChannel, localFilePathSchema, statusChannel } from "../shared/contracts.ts";
import { connectionRequestChannel } from "../shared/connection.ts";
import { RuntimeHost } from "./runtime-host.ts";
import { applicationBrand, applicationDataDirectory, applicationId, applicationStorage } from "../shared/application.ts";
import { followWindowAppearance, initialWindowAppearance } from "./window-appearance.ts";
import { applyThemeSource, readAppearance, serveAppearance } from "./appearance.ts";
import { initialWindowState, trackWindowState } from "./window-state.ts";
import { initialTitleBar, serveDesktopWindow, titleBarMode } from "./window-titlebar.ts";
import { servePreferences } from "./ui-state.ts";
import { serveLanguage, readLanguage } from "./language.ts";
import { startupText } from "./startup-text.ts";
import { startupMessages } from "../shared/error-display.ts";
import { allowRendererPermission } from "./permissions.ts";
import { StartupCoordinator } from "./startup-coordinator.ts";
import { initializeApplicationLog } from "./logging.ts";
import { ApplicationUpdates } from "./updates.ts";
import { startupGetChannel, startupChangedChannel, startupRestartChannel, startupDataDirectoryChannel, startupRecoveryChannel, startupRecoveryPointChannel, startupInitializedChannel } from "../shared/startup.ts";
import { recoveryActionSchema, type RecoveryPoint } from "../shared/recovery.ts";
import { appearanceChangedChannel } from "../shared/theme.ts";
import { languageChangedChannel } from "../shared/language.ts";
import { enableSettings } from "./settings-state.ts";
import { acknowledgeNotice, listRecoveryPoints, pendingNotice, recoveryPointDirectory } from "../storage/preparation.ts";

const here = dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | null = null;
let quitting = false;
let quitRequest: Promise<void> | null = null;
let updates: ApplicationUpdates | null = null;
let notificationsDelivered = false;
let recoveryPending = false;
/** Reconnect appearance, language, and update settings if host storage becomes ready after the window appears. */
let connectSettings: (() => void) | null = null;
/** Trusted renderer page URL without the hash, used for permission decisions. */
let trustedURL: string | null = null;
const runtime = new RuntimeHost(status => {
  if (window && !window.isDestroyed()) window.webContents.send(statusChannel, status);
  if (status === "ready") startup.publish({ status: "ready" });
  else if (status === "unavailable" && startup.state.status === "ready")
    startup.publish({ status: "failed", reason: "runtime", detail: "The task runtime has stopped." });
}, undefined, (stage, detail) => startup.stage(stage, detail));

/** Read current resource prompts before user exit; after confirmation, wait for background cleanup through the existing close flow. */
function requestQuit(restart = false, installUpdate = false): void {
  if (quitting || quitRequest) return;
  quitRequest = (async () => {
    const result = await runtime.execute({ type: "workspace.prepare-close" });
    const warnings = result.ok ? result.snapshot.disposalWarnings ?? [] : [];
    if (warnings.length) {
      const locale = () => readLanguage().locale;
      const options: Electron.MessageBoxOptions = {
        type: "warning", title: applicationBrand.en,
        message: startupText(startupMessages.quitTitle, locale),
        detail: startupText({ ...startupMessages.quitDescription, values: { resources: warnings.map(item => item.title).join("\n") } }, locale),
        buttons: [startupText(startupMessages.quitCancel, locale), startupText(startupMessages.quitConfirm, locale)],
        defaultId: 0, cancelId: 0,
      };
      const answer = window && !window.isDestroyed() ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
      if (answer.response !== 1) return;
    }
    quitting = true;
    await Promise.all([startup.stop(), runtime.stop()]);
    if (installUpdate && updates?.ready) {
      updates.install(error => {
        quitting = false;
        startup.publish({ status: "failed", reason: "runtime", detail: error.message });
        // The workbench has ended its startup subscription; re-enter startup to present failure and restart actions.
        if (window && !window.isDestroyed()) window.webContents.reload();
      });
      return;
    }
    if (restart) app.relaunch();
    app.quit();
  })().catch(error => { console.error("Application shutdown failed.", error); }).finally(() => { quitRequest = null; });
}

/** App icon file: packaged builds read extraResource from resources; development uses repository assets/icon. */
function applicationIconFile(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(here, "../../assets/icon", name);
}

/** Prompt once after the home page mounts for a successful migration recovery point; acknowledgment clears the prompt marker. */
async function showMigrationNotice(current: BrowserWindow): Promise<void> {
  let point: RecoveryPoint | null;
  try { point = pendingNotice(dataRoot); } catch (error) { console.error("Recovery points could not be read.", error); return; }
  if (!point || current.isDestroyed()) return;
  const locale = () => readLanguage().locale;
  const answer = await dialog.showMessageBox(current, { type: "info", title: applicationBrand.en,
    message: startupText(startupMessages.migratedTitle, locale),
    detail: startupText({ ...startupMessages.migratedBody, values: {
      changes: point.changes.map(change => `${change.id}: ${change.from} → ${change.to}`).join("\n"),
      location: recoveryPointDirectory(dataRoot, point.id),
    } }, locale),
    buttons: [startupText(startupMessages.migratedConfirm, locale), startupText(startupMessages.openRecoveryPoint, locale)],
  });
  try { acknowledgeNotice(dataRoot); } catch (error) { console.error("The migration notice could not be acknowledged.", error); }
  if (answer.response === 1) await shell.openPath(recoveryPointDirectory(dataRoot, point.id));
}

function createWindow(): void {
  applyThemeSource();
  const rendererFile = join(here, "../renderer/index.html");
  const developmentURL = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  const allowedURL = new URL(developmentURL ?? pathToFileURL(rendererFile).href).href;
  trustedURL = allowedURL.split("#")[0]!;
  const state = initialWindowState();
  const titleBar = titleBarMode();
  window = new BrowserWindow({
    ...state.bounds, minWidth: state.minWidth, minHeight: state.minHeight, title: applicationBrand.en,
    // macOS and Windows use embedded package icons; Linux windows require an explicit icon.
    ...(process.platform === "linux" ? { icon: applicationIconFile("asterism-full.png") } : {}),
    ...initialWindowAppearance(),
    ...initialTitleBar(titleBar),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      webviewTag: false,
    },
  });
  const current = window;
  current.on("close", event => { if (!quitting) { event.preventDefault(); requestQuit(); } });
  if (state.maximized) current.maximize();
  trackWindowState(current);
  const refreshAppearance = followWindowAppearance(current, titleBar);
  current.webContents.setWindowOpenHandler(({ url }) => {
    const external = externalWebUrl(url);
    if (external) void shell.openExternal(external).catch(() => console.error("External link could not be opened."));
    return { action: "deny" };
  });
  current.webContents.on("will-navigate", event => event.preventDefault());
  current.webContents.on("will-attach-webview", event => event.preventDefault());
  ipcMain.removeHandler(pickDirectoryChannel);
  ipcMain.removeHandler(openLocalFileChannel);
  ipcMain.removeHandler(openLogsChannel);
  const trusted = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => event.sender === current.webContents &&
    event.senderFrame === current.webContents.mainFrame && event.senderFrame?.url === allowedURL;
  ipcMain.handle(startupGetChannel, event => {
    if (!trusted(event)) throw new Error("Untrusted application frame.");
    return startup.state;
  });
  ipcMain.handle(startupRestartChannel, event => { if (trusted(event)) requestQuit(true); });
  ipcMain.handle(startupDataDirectoryChannel, event => {
    if (!trusted(event) || startup.state.status !== "failed")
      return "The data folder is unavailable.";
    return shell.openPath(dataRoot);
  });
  ipcMain.handle(startupRecoveryPointChannel, (event, id: unknown) => {
    if (!trusted(event) || typeof id !== "string" || !listRecoveryPoints(dataRoot).some(point => point.id === id))
      return "The recovery point is unavailable.";
    return shell.openPath(recoveryPointDirectory(dataRoot, id));
  });
  ipcMain.handle(startupRecoveryChannel, async (event, raw) => {
    if (!trusted(event) || startup.state.status !== "failed" || startup.state.reason !== "data" || recoveryPending) return "Data recovery is unavailable.";
    const action = recoveryActionSchema.parse(raw);
    recoveryPending = true;
    try {
      if (action.kind !== "retry") {
        const locale = () => readLanguage().locale;
        const answer = await dialog.showMessageBox(current, {
          type: "warning", title: applicationBrand.en,
          message: startupText(action.kind === "restore" ? startupMessages.restoreTitle : startupMessages.freshTitle, locale),
          detail: startupText(action.kind === "restore" ? startupMessages.restoreBody : startupMessages.freshBody, locale),
          buttons: [startupText(startupMessages.quitCancel, locale), startupText(startupMessages.recoveryConfirm, locale)],
          defaultId: 0, cancelId: 0,
        });
        if (answer.response !== 1) return;
      }
      // Recovery operations only change files; restart afterward so the next startup's data preparation continues.
      await startup.recover(action);
      requestQuit(true);
    } catch (error) { return error instanceof Error ? error.message : String(error); }
    finally { recoveryPending = false; }
  });
  ipcMain.handle(startupInitializedChannel, event => {
    if (!trusted(event) || startup.state.status !== "ready" || notificationsDelivered) return [];
    notificationsDelivered = true;
    void showMigrationNotice(current);
    return startup.storageFailures;
  });
  // Renderer and task process connect directly: validate the source only at port handoff, and close old connections on reload, navigation, or crash.
  let connection: string | null = null;
  const closeConnection = () => { if (connection) { runtime.disconnect(connection); connection = null; } };
  const requestConnection = (event: Electron.IpcMainEvent) => {
    if (!trusted(event)) return;
    closeConnection();
    const { port1, port2 } = new MessageChannelMain();
    const id = randomUUID();
    if (runtime.connect(id, port1)) {
      connection = id;
      event.sender.postMessage(connectionRequestChannel, null, [port2]);
    } else {
      port1.close(); port2.close();
      event.sender.postMessage(connectionRequestChannel, null);
    }
  };
  ipcMain.on(connectionRequestChannel, requestConnection);
  const stopAppearance = serveAppearance(current, trusted, () => refreshAppearance());
  const stopDesktopWindow = serveDesktopWindow(current, titleBar, trusted);
  const stopPreferences = servePreferences(trusted);
  const stopLanguage = serveLanguage(current, trusted);
  let stopUpdates = () => {};
  // Reapply settings and notify loaded pages if host storage becomes ready after the window appears.
  connectSettings = () => {
    if (current.isDestroyed()) return;
    stopUpdates();
    stopUpdates = updates?.serve(current, trusted, () => requestQuit(false, true)) ?? (() => {});
    applyThemeSource();
    refreshAppearance();
    current.webContents.send(appearanceChangedChannel, readAppearance());
    current.webContents.send(languageChangedChannel, readLanguage());
  };
  stopUpdates = updates?.serve(current, trusted, () => requestQuit(false, true)) ?? (() => {});
  current.webContents.on("render-process-gone", (_event, details) => {
    closeConnection();
    if (!quitting && details.reason !== "clean-exit")
      dialog.showErrorBox(applicationBrand.en, startupText(startupMessages.windowLoadFailed, () => readLanguage().locale));
  });
  current.webContents.on("preload-error", (_event, _path, error) => {
    console.error("Desktop bridge initialization failed.", error);
    dialog.showErrorBox(applicationBrand.en, startupText(startupMessages.windowLoadFailed, () => readLanguage().locale));
  });
  current.webContents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) closeConnection();
  });
  // Return only paths selected in the system dialog; the renderer cannot use this to read files.
  ipcMain.handle(pickDirectoryChannel, async (event, raw: unknown) => {
    if (!trusted(event)) return null;
    const candidate = typeof raw === "string" ? raw.trim() : "";
    const isDirectory = isAbsolute(candidate) && await stat(candidate).then(info => info.isDirectory()).catch(() => false);
    const result = await dialog.showOpenDialog(current, {
      properties: ["openDirectory"],
      defaultPath: isDirectory ? candidate : homedir(),
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle(openLocalFileChannel, async (event, raw: unknown) => {
    if (!trusted(event)) return "Untrusted application frame.";
    const parsed = localFilePathSchema.safeParse(raw);
    if (!parsed.success || !isAbsolute(parsed.data)) return "An absolute local file path is required.";
    return shell.openPath(parsed.data);
  });
  // The main process resolves the log directory from the data root; the renderer only requests opening it.
  ipcMain.handle(openLogsChannel, event => {
    if (!trusted(event)) return "Untrusted application frame.";
    const directory = join(dataRoot, applicationStorage.logsDirectory);
    mkdirSync(directory, { recursive: true });
    return shell.openPath(directory);
  });
  current.on("closed", () => {
    stopDesktopWindow();
    ipcMain.removeListener(connectionRequestChannel, requestConnection);
    for (const channel of [startupGetChannel, startupRestartChannel, startupDataDirectoryChannel, startupRecoveryPointChannel, startupRecoveryChannel, startupInitializedChannel]) ipcMain.removeHandler(channel);
    connectSettings = null;
    closeConnection();
    window = null; ipcMain.removeHandler(pickDirectoryChannel); ipcMain.removeHandler(openLocalFileChannel); ipcMain.removeHandler(openLogsChannel);
    stopAppearance(); stopPreferences(); stopLanguage(); stopUpdates();
  });
  const loading = developmentURL ? current.loadURL(developmentURL) : current.loadFile(rendererFile);
  loading.catch(error => { console.error("Renderer initialization failed.", error); dialog.showErrorBox(applicationBrand.en, startupText(startupMessages.windowLoadFailed, () => readLanguage().locale)); });
}

// Plugin artifact protocol: read-only access to the plugin cache directory bundled at startup, with no access to other paths.
protocol.registerSchemesAsPrivileged([{ scheme: "asterism-plugin", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
function servePluginArtifacts(root: string): void {
  const cache = resolve(root, "plugins", ".cache");
  protocol.handle("asterism-plugin", request => {
    const url = new URL(request.url);
    const file = resolve(cache, url.hostname, `.${decodeURIComponent(url.pathname)}`);
    const inside = pathWithin(cache, file);
    if (!inside || inside.includes(":")) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
}

app.setName(applicationBrand.en);
if (process.platform === "win32") app.setAppUserModelId(applicationId);
// Both builds explicitly use the fixed identity directory; create it before setting paths and acquiring the single-instance lock.
const dataRoot = join(app.getPath("appData"), applicationDataDirectory(app.isPackaged));
mkdirSync(dataRoot, { recursive: true });
app.setPath("userData", dataRoot);
const startup = new StartupCoordinator({
  directory: here, root: dataRoot, version: app.getVersion(),
  publish: state => {
    if (window && !window.isDestroyed()) window.webContents.send(startupChangedChannel, state);
  },
  showWindow: () => { if (!quitting && !window) createWindow(); },
  settingsReady: () => {
    enableSettings();
    try { updates = new ApplicationUpdates(); } catch (error) { console.error("Update settings could not be opened.", error); }
    connectSettings?.();
  },
  startRuntime: async failures => {
    await runtime.start(join(here, "runtime.js"), dataRoot, failures);
    void updates?.check();
  },
});
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  initializeApplicationLog(dataRoot, app.getVersion());
  const sessionRoot = join(dataRoot, applicationStorage.chromiumDirectory);
  mkdirSync(sessionRoot, { recursive: true });
  app.setPath("sessionData", sessionRoot);
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(async () => {
    if (quitting) return;
    // Permission checks and requests share one policy, allowing only trusted main-frame font enumeration and clipboard writes.
    // Determine trust from the window's current URL: file:// origins can be "null", so origin strings are insufficient.
    const permitted = (contents: Electron.WebContents | null, permission: string, isMainFrame: boolean) =>
      allowRendererPermission({ permission, isMainFrame, contents, mainContents: window?.webContents, trustedURL });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) =>
      callback(permitted(contents, permission, details.isMainFrame)));
    session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
      permitted(contents, permission, details.isMainFrame));
    servePluginArtifacts(dataRoot);
    // Development runs have no application bundle icon; explicitly use the production icon in the Dock.
    if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(applicationIconFile("asterism.png"));
    await startup.run();
    app.on("activate", () => { if (!quitting && BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(error => {
    console.error("Electron initialization failed.", error);
    dialog.showErrorBox(applicationBrand.en, startupText(startupMessages.windowLoadFailed, () => readLanguage().locale));
    app.quit();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", event => {
    if (quitting) return;
    event.preventDefault();
    requestQuit();
  });
}
