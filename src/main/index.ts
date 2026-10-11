import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from "electron";
import { externalWebUrl } from "../shared/links.ts";
import { mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { objectStreamChannel, commandChannel, commandSchema, pickDirectoryChannel, statusChannel, type CommandResult } from "../shared/contracts.ts";
import { RuntimeHost } from "./runtime-host.ts";
import { applicationBrand, applicationDataDirectory, applicationId, applicationStorage } from "../shared/application.ts";
import { followWindowAppearance, initialWindowAppearance } from "./window-appearance.ts";
import { applyThemeSource, serveAppearance } from "./appearance.ts";
import { initialWindowState, trackWindowState } from "./window-state.ts";
import { configurationChannel, configurationChangedChannel, configurationCommandSchema, type ConfigurationResult } from "../shared/configuration.ts";
import { sessionChannel, sessionChangedChannel, sessionCommandSchema, type SessionResult } from "../shared/session.ts";

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
  if (window && !window.isDestroyed()) window.webContents.send(objectStreamChannel, event.sessionId, event.objectId, event.channel, event.data);
});

function createWindow(): void {
  applyThemeSource();
  const rendererFile = join(here, "../renderer/index.html");
  const developmentURL = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  const allowedURL = new URL(developmentURL ?? pathToFileURL(rendererFile).href).href;
  trustedURL = allowedURL.split("#")[0]!;
  const state = initialWindowState();
  window = new BrowserWindow({
    ...state.bounds, minWidth: state.minWidth, minHeight: state.minHeight, title: applicationBrand.en,
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
  ipcMain.removeHandler(sessionChannel);
  ipcMain.removeHandler(pickDirectoryChannel);
  const trusted = (event: Electron.IpcMainInvokeEvent) => event.sender === current.webContents &&
    event.senderFrame === current.webContents.mainFrame && event.senderFrame?.url === allowedURL;
  const stopAppearance = serveAppearance(current, trusted, () => refreshAppearance());
  ipcMain.handle(sessionChannel, async (event, raw): Promise<SessionResult> => {
    if (!trusted(event)) return { ok: false, error: { code: "invalid_request", message: "Untrusted application frame." } };
    const parsed = sessionCommandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid session command." } };
    return runtime.session(parsed.data);
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
    window = null; ipcMain.removeHandler(commandChannel); ipcMain.removeHandler(configurationChannel); ipcMain.removeHandler(sessionChannel); ipcMain.removeHandler(pickDirectoryChannel); stopAppearance();
  });
  const loading = developmentURL ? current.loadURL(developmentURL) : current.loadFile(rendererFile);
  loading.catch(error => { console.error("Renderer initialization failed.", error); dialog.showErrorBox(applicationBrand.en, "The application window could not be loaded."); });
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
    // 仅放行受信主框架的本机字体枚举（只暴露字体名），其余权限一律拒绝。
    // 以窗口当前 URL 判定受信：file:// 的 origin 可能为 "null"，不可依赖 origin 字符串。
    const trustedFonts = (contents: Electron.WebContents | null, permission: string, isMainFrame: boolean) =>
      permission === "local-fonts" && isMainFrame && !!contents && contents === window?.webContents && !!trustedURL && contents.getURL().split("#")[0] === trustedURL;
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) =>
      callback(trustedFonts(contents, permission, details.isMainFrame)));
    session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
      trustedFonts(contents, permission, details.isMainFrame));
    servePluginArtifacts(dataRoot);
    try { await runtime.start(join(here, "runtime.js"), dataRoot); }
    catch (error) {
      console.error("Application startup failed.", error);
      dialog.showErrorBox(applicationBrand.en, error instanceof Error ? error.message : "The workspace could not be opened.");
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
