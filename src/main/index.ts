import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import { externalWebUrl } from "../shared/links.ts";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { commandChannel, commandSchema, statusChannel, type CommandResult } from "../shared/contracts.ts";
import { RuntimeHost } from "./runtime-host.ts";
import { applicationId } from "../shared/desktop.ts";
import { followWindowAppearance, initialWindowAppearance } from "./window-appearance.ts";
import { applyThemeSource, serveAppearance } from "./appearance.ts";
import { initialWindowState, trackWindowState } from "./window-state.ts";
import { configurationChannel, configurationChangedChannel, configurationCommandSchema, type ConfigurationResult } from "../shared/configuration.ts";
import { conversationChannel, conversationChangedChannel, conversationCommandSchema, type ConversationResult } from "../shared/conversation.ts";

const here = dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | null = null;
let quitting = false;
const runtime = new RuntimeHost(status => {
  if (window && !window.isDestroyed()) window.webContents.send(statusChannel, status);
}, () => {
  if (window && !window.isDestroyed()) window.webContents.send(configurationChangedChannel);
}, event => {
  if (window && !window.isDestroyed()) window.webContents.send(conversationChangedChannel, event);
});

function createWindow(): void {
  applyThemeSource();
  const rendererFile = join(here, "../renderer/index.html");
  const developmentURL = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  const allowedURL = new URL(developmentURL ?? pathToFileURL(rendererFile).href).href;
  const state = initialWindowState();
  window = new BrowserWindow({
    ...state.bounds, minWidth: state.minWidth, minHeight: state.minHeight, title: "Weft",
    ...initialWindowAppearance(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      webviewTag: false,
    },
  });
  const current = window;
  if (state.maximized) current.maximize();
  trackWindowState(current);
  const refreshAppearance = followWindowAppearance(current);
  current.webContents.setWindowOpenHandler(({ url }) => {
    const external = externalWebUrl(url);
    if (external) void shell.openExternal(external).catch(() => console.error("External link could not be opened."));
    return { action: "deny" };
  });
  current.webContents.on("will-navigate", event => event.preventDefault());
  current.webContents.on("will-attach-webview", event => event.preventDefault());
  ipcMain.removeHandler(commandChannel);
  ipcMain.removeHandler(configurationChannel);
  ipcMain.removeHandler(conversationChannel);
  const trusted = (event: Electron.IpcMainInvokeEvent) => event.sender === current.webContents &&
    event.senderFrame === current.webContents.mainFrame && event.senderFrame?.url === allowedURL;
  const stopAppearance = serveAppearance(current, trusted, () => refreshAppearance());
  ipcMain.handle(conversationChannel, async (event, raw): Promise<ConversationResult> => {
    if (!trusted(event)) return { ok: false, error: { code: "invalid_request", message: "Untrusted application frame." } };
    const parsed = conversationCommandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid conversation command." } };
    return runtime.converse(parsed.data);
  });
  ipcMain.handle(commandChannel, async (event, raw): Promise<CommandResult> => {
    if (event.sender !== current.webContents || event.senderFrame !== current.webContents.mainFrame ||
      event.senderFrame.url !== allowedURL) {
      return { ok: false, error: { code: "invalid_request", message: "Untrusted application frame." } };
    }
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid application command." } };
    return runtime.execute(parsed.data);
  });
  ipcMain.handle(configurationChannel, async (event, raw): Promise<ConfigurationResult> => {
    if (event.sender !== current.webContents || event.senderFrame !== current.webContents.mainFrame ||
      event.senderFrame.url !== allowedURL) {
      return { ok: false, error: { code: "invalid_request", message: "Untrusted application frame." } };
    }
    const parsed = configurationCommandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid configuration command." } };
    return runtime.configure(parsed.data);
  });
  current.on("closed", () => {
    window = null; ipcMain.removeHandler(commandChannel); ipcMain.removeHandler(configurationChannel); ipcMain.removeHandler(conversationChannel); stopAppearance();
  });
  const loading = developmentURL ? current.loadURL(developmentURL) : current.loadFile(rendererFile);
  loading.catch(error => { console.error("Renderer initialization failed.", error); dialog.showErrorBox("Weft", "The application window could not be loaded."); });
}

app.setName("Weft");
if (process.platform === "win32") app.setAppUserModelId(applicationId);
// 数据位置在获取单实例锁之前确定，开发版与发布版分别持有锁。
if (!app.isPackaged) app.setPath("userData", join(app.getPath("appData"), "Weft-development"));
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const dataRoot = app.getPath("userData");
  const sessionRoot = join(dataRoot, "chromium");
  mkdirSync(sessionRoot, { recursive: true });
  app.setPath("sessionData", sessionRoot);
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(async () => {
    if (quitting) return;
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    try { await runtime.start(join(here, "runtime.js"), dataRoot); }
    catch (error) {
      console.error("Application startup failed.", error);
      dialog.showErrorBox("Weft", error instanceof Error ? error.message : "The workspace could not be opened.");
    }
    if (!quitting) createWindow();
    app.on("activate", () => { if (!quitting && BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(error => { console.error("Electron initialization failed.", error); app.quit(); });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", event => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void runtime.stop().finally(() => app.quit());
  });
}
