import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from "electron";
import { externalWebUrl } from "@atelier/ui/links";
import { mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { commandChannel, commandSchema, pickDirectoryChannel, statusChannel, type CommandResult } from "../shared/contracts.ts";
import { objectStreamChannel } from "../shared/object-stream.ts";
import { RuntimeHost } from "./runtime-host.ts";
import { applicationBrand, applicationDataDirectory, applicationId, applicationStorage } from "../shared/application.ts";
import { followWindowAppearance, initialWindowAppearance } from "./window-appearance.ts";
import { applyThemeSource, serveAppearance } from "./appearance.ts";
import { initialWindowState, trackWindowState } from "./window-state.ts";
import { initialTitleBar, serveDesktopWindow, titleBarMode } from "./window-titlebar.ts";
import { servePreferences } from "./ui-state.ts";
import { serveLanguage, readLanguage } from "./language.ts";
import { startupText } from "./startup-text.ts";
import { startupMessages } from "../shared/error-display.ts";
import { configurationChannel, configurationChangedChannel, configurationCommandSchema, type ConfigurationResult } from "../shared/configuration.ts";
import { sessionChannel, sessionChangedChannel, sessionCommandSchema, type SessionResult } from "../shared/session.ts";
import { pluginConfigurationChangedChannel, pluginConfigurationChannel, pluginConfigurationCommandSchema, type PluginConfigurationResult } from "../shared/plugin-configuration.ts";
import { contentChannel, contentCommandSchema, type ContentResult } from "../shared/content.ts";
import { pluginEventsChannel, eventControlSchema } from "../shared/plugin-events.ts";
import { pluginCallsChannel, callControlSchema } from "../shared/plugin-calls.ts";
import { allowRendererPermission } from "./permissions.ts";

const here = dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | null = null;
let quitting = false;
/** 受信渲染页地址（不含 hash），供权限判定使用。 */
let trustedURL: string | null = null;
const runtime = new RuntimeHost(status => {
  if (window && !window.isDestroyed()) window.webContents.send(statusChannel, status);
}, () => {
  if (window && !window.isDestroyed()) window.webContents.send(configurationChangedChannel);
}, event => {
  if (window && !window.isDestroyed()) window.webContents.send(sessionChangedChannel, event);
}, event => {
  // 高频二进制只转发给窗口，不经会话 IPC 或持久化。
  if (window && !window.isDestroyed()) window.webContents.send(objectStreamChannel, event);
}, pluginId => {
  if (window && !window.isDestroyed()) window.webContents.send(pluginConfigurationChangedChannel, pluginId);
}, frame => {
  if (window && !window.isDestroyed()) window.webContents.send(pluginEventsChannel, frame);
}, frame => {
  if (window && !window.isDestroyed()) window.webContents.send(pluginCallsChannel, frame);
});

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
  ipcMain.removeHandler(commandChannel);
  ipcMain.removeHandler(configurationChannel);
  ipcMain.removeHandler(sessionChannel);
  ipcMain.removeHandler(pickDirectoryChannel);
  ipcMain.removeHandler(pluginConfigurationChannel);
  ipcMain.removeHandler(contentChannel);
  const trusted = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => event.sender === current.webContents &&
    event.senderFrame === current.webContents.mainFrame && event.senderFrame?.url === allowedURL;
  const receiveEvents = (event: Electron.IpcMainEvent, raw: unknown) => {
    if (!trusted(event)) return;
    const parsed = eventControlSchema.safeParse(raw);
    if (parsed.success) runtime.events(parsed.data);
  };
  ipcMain.on(pluginEventsChannel, receiveEvents);
  const receiveCalls = (event: Electron.IpcMainEvent, raw: unknown) => {
    if (!trusted(event)) return;
    const parsed = callControlSchema.safeParse(raw);
    if (parsed.success) runtime.calls(parsed.data);
  };
  ipcMain.on(pluginCallsChannel, receiveCalls);
  const stopAppearance = serveAppearance(current, trusted, () => refreshAppearance());
  const stopDesktopWindow = serveDesktopWindow(current, titleBar, trusted);
  const stopPreferences = servePreferences(trusted);
  const stopLanguage = serveLanguage(current, trusted);
  ipcMain.handle(contentChannel, async (event, raw): Promise<ContentResult> => {
    if (!trusted(event)) return { ok: false, error: { code: "invalid_request", message: "Untrusted application frame." } };
    const parsed = contentCommandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid content command." } };
    return runtime.content(parsed.data);
  });
  const resetRenderer = () => { runtime.events({ type: "reset" }); runtime.calls({ type: "reset" }); void runtime.content({ type: "reset" }); };
  current.webContents.on("render-process-gone", resetRenderer);
  current.webContents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) resetRenderer();
  });
  ipcMain.handle(sessionChannel, async (event, raw): Promise<SessionResult> => {
    if (!trusted(event)) return { ok: false, error: { code: "invalid_request", message: "Untrusted application frame." } };
    const parsed = sessionCommandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid session command." } };
    return runtime.session(parsed.data);
  });
  ipcMain.handle(pluginConfigurationChannel, async (event, raw): Promise<PluginConfigurationResult> => {
    if (!trusted(event)) return { ok: false, error: { code: "invalid_request", message: "Untrusted application frame." } };
    const parsed = pluginConfigurationCommandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid plugin configuration command." } };
    return runtime.configurePlugin(parsed.data);
  });
  // 只返回用户在系统窗口中选择的路径；渲染端不能借此读取文件。
  ipcMain.handle(pickDirectoryChannel, async event => {
    if (!trusted(event)) return null;
    const result = await dialog.showOpenDialog(current, { properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
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
    stopDesktopWindow();
    ipcMain.removeListener(pluginEventsChannel, receiveEvents);
    ipcMain.removeListener(pluginCallsChannel, receiveCalls);
    ipcMain.removeHandler(contentChannel);
    resetRenderer();
    window = null; ipcMain.removeHandler(commandChannel); ipcMain.removeHandler(configurationChannel); ipcMain.removeHandler(sessionChannel); ipcMain.removeHandler(pickDirectoryChannel); ipcMain.removeHandler(pluginConfigurationChannel); stopAppearance(); stopPreferences(); stopLanguage();
  });
  const loading = developmentURL ? current.loadURL(developmentURL) : current.loadFile(rendererFile);
  loading.catch(error => { console.error("Renderer initialization failed.", error); dialog.showErrorBox(applicationBrand.en, startupText(startupMessages.windowLoadFailed, () => readLanguage().locale)); });
}

// 插件产物协议：只读提供启动时打包的插件缓存目录，不访问其他路径。
protocol.registerSchemesAsPrivileged([{ scheme: "atelier-plugin", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
function servePluginArtifacts(root: string): void {
  const cache = resolve(root, "plugins", ".cache");
  protocol.handle("atelier-plugin", request => {
    const url = new URL(request.url);
    const file = resolve(cache, url.hostname, `.${decodeURIComponent(url.pathname)}`);
    const inside = relative(cache, file);
    if (!inside || inside.startsWith("..") || inside.includes(":")) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
}

app.setName(applicationBrand.en);
if (process.platform === "win32") app.setAppUserModelId(applicationId);
// 两种构建都显式取固定身份目录；先建目录，再设置路径和获取单实例锁。
const dataRoot = join(app.getPath("appData"), applicationDataDirectory(app.isPackaged));
mkdirSync(dataRoot, { recursive: true });
app.setPath("userData", dataRoot);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const sessionRoot = join(dataRoot, applicationStorage.chromiumDirectory);
  mkdirSync(sessionRoot, { recursive: true });
  app.setPath("sessionData", sessionRoot);
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(async () => {
    if (quitting) return;
    // 权限检查和请求共用同一策略；只放行受信主框架的字体枚举与剪贴板写入。
    // 以窗口当前 URL 判定受信：file:// 的 origin 可能为 "null"，不可依赖 origin 字符串。
    const permitted = (contents: Electron.WebContents | null, permission: string, isMainFrame: boolean) =>
      allowRendererPermission({ permission, isMainFrame, contents, mainContents: window?.webContents, trustedURL });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) =>
      callback(permitted(contents, permission, details.isMainFrame)));
    session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
      permitted(contents, permission, details.isMainFrame));
    servePluginArtifacts(dataRoot);
    try { await runtime.start(join(here, "runtime.js"), dataRoot); }
    catch (error) {
      console.error("Application startup failed.", error);
      const { reason, directory } = error as { reason?: string; directory?: string };
      if (reason === "database_version" && directory) {
        // 开发者机制，文案不本地化；正式版由迁移机制处理。
        const { response } = await dialog.showMessageBox({ type: "error", title: applicationBrand.en, message: "Development data format mismatch",
          detail: error instanceof Error ? error.message : "", buttons: ["Open Data Folder", "OK"], defaultId: 0 });
        if (response === 0) await shell.openPath(directory);
      } else dialog.showErrorBox(applicationBrand.en, error instanceof Error ? error.message : startupText(startupMessages.workspaceOpenFailed, () => readLanguage().locale));
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
