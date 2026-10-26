import { createRoot } from "react-dom/client";
import { HostI18nProvider, startLanguage } from "./shared/i18n";
import { startAppearance } from "./features/appearance/state";
import { startDesktopWindow } from "./app/window-state";
import { loadPreferences } from "./features/creation/preferences";
import { StartupScreen, type StartupFailure } from "./app/StartupScreen";
import { StartupError, awaitStartup, waitForRuntime } from "./app/boot";
import { startupMessages } from "../shared/error-display";
import type { UiText } from "@atelier/sdk/contracts";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const lifetime = new AbortController();
window.addEventListener("pagehide", () => lifetime.abort(), { once: true });
const show = (stage: UiText, detail?: string, failure?: StartupFailure) => {
  root.render(<HostI18nProvider><StartupScreen stage={stage} detail={detail} failure={failure} /></HostI18nProvider>);
};
show(startupMessages.dataCheck);

async function boot(): Promise<void> {
  startAppearance();
  const keep = (stop: () => void) => {
    if (lifetime.signal.aborted) stop();
    else lifetime.signal.addEventListener("abort", stop, { once: true });
  };
  const desktopSignal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(90_000)]);
  await Promise.all([
    awaitStartup(Promise.all([
      startLanguage([]).then(keep).catch(error => console.error("Language settings could not be loaded. English is used.", error)),
      loadPreferences(),
      startDesktopWindow(window.host.window).then(keep),
    ]), desktopSignal),
    // 桌面桥首次读取有期限；后台阶段持续订阅，由主进程管理实际工作的期限。
    waitForRuntime(window.host.startup, lifetime.signal, state => show(startupMessages[state.stage], state.detail), desktopSignal),
  ]);
  show(startupMessages.interface);
  // 页面装载和前端插件准备共用总等待期限，单个插件另有更短的准备期限。
  const deadline = new AbortController();
  const signal = AbortSignal.any([lifetime.signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(new DOMException("Interface initialization timed out after 60 seconds.", "TimeoutError")), 60_000);
  try {
    await awaitStartup(import("./application").then(module => {
      signal.throwIfAborted();
      return module.startApplication(root, (message, detail) => show(message, detail), signal);
    }), signal);
  } finally { clearTimeout(timer); }
}

void boot().catch(error => {
  if (lifetime.signal.aborted) return;
  lifetime.abort();
  console.error("Application interface initialization failed.", error);
  const failure: StartupFailure = error instanceof StartupError ? error.failure
    : { reason: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "initialization",
      detail: error instanceof Error ? error.message : String(error) };
  show(startupMessages.failed, undefined, failure);
});
