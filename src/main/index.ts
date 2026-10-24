import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, net, protocol, session, shell } from "electron";
import { randomUUID } from "node:crypto";
import { externalWebUrl } from "@atelier/ui/links";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pickDirectoryChannel, openLocalFileChannel, openLogsChannel, localFilePathSchema, statusChannel } from "../shared/contracts.ts";
import { connectionRequestChannel } from "../shared/connection.ts";
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
import { allowRendererPermission } from "./permissions.ts";
import { adoptLoginShellEnvironment } from "./shell-environment.ts";

const here = dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | null = null;
let quitting = false;
let quitRequest: Promise<void> | null = null;
/** 受信渲染页地址（不含 hash），供权限判定使用。 */
let trustedURL: string | null = null;
const runtime = new RuntimeHost(status => {
  if (window && !window.isDestroyed()) window.webContents.send(statusChannel, status);
});

/** 用户退出先读取资源的当前提示；确认后按原关闭流程等待后台清理。 */
function requestQuit(): void {
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
    await runtime.stop();
    app.quit();
  })().catch(error => { console.error("Application shutdown failed.", error); }).finally(() => { quitRequest = null; });
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
  // renderer 与任务进程直连：只在交接端口时校验来源；页面重载、跳转或崩溃时关闭旧连接。
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
  current.webContents.on("render-process-gone", closeConnection);
  current.webContents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) closeConnection();
  });
  // 只返回用户在系统窗口中选择的路径；渲染端不能借此读取文件。
  ipcMain.handle(pickDirectoryChannel, async event => {
    if (!trusted(event)) return null;
    const result = await dialog.showOpenDialog(current, { properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle(openLocalFileChannel, async (event, raw: unknown) => {
    if (!trusted(event)) return "Untrusted application frame.";
    const parsed = localFilePathSchema.safeParse(raw);
    if (!parsed.success || !isAbsolute(parsed.data)) return "An absolute local file path is required.";
    return shell.openPath(parsed.data);
  });
  // 日志目录由主进程按数据根解析；渲染端只发起打开请求。
  ipcMain.handle(openLogsChannel, event => {
    if (!trusted(event)) return "Untrusted application frame.";
    const directory = join(dataRoot, applicationStorage.logsDirectory);
    mkdirSync(directory, { recursive: true });
    return shell.openPath(directory);
  });
  current.on("closed", () => {
    stopDesktopWindow();
    ipcMain.removeListener(connectionRequestChannel, requestConnection);
    closeConnection();
    window = null; ipcMain.removeHandler(pickDirectoryChannel); ipcMain.removeHandler(openLocalFileChannel); ipcMain.removeHandler(openLogsChannel);
    stopAppearance(); stopPreferences(); stopLanguage();
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
  // 登录 shell 环境与 Electron 初始化并行解析，任务进程 fork 前写回 process.env。
  const environment = adoptLoginShellEnvironment();
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
    await environment;
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
    requestQuit();
  });
}
