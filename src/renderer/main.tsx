import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { HostI18nProvider, startLanguage } from "./shared/i18n";
import { startAppearance } from "./features/appearance/state";
import { startDesktopWindow } from "./app/window-state";
import { loadPreferences } from "./features/creation/preferences";
import { StartupScreen, type StartupFailure } from "./app/StartupScreen";
import { AfterCommit, startupSplash } from "./app/startup-splash";
import { StartupError, awaitStartup, waitForRuntime } from "./app/boot";
import { startupMessages } from "../shared/error-display";
import { reportRendererFailure } from "./shared/failure";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const splash = startupSplash(document.getElementById("startup-splash")!);
const lifetime = new AbortController();
window.addEventListener("pagehide", () => lifetime.abort(), { once: true });
splash.stage(startupMessages.dataCheck);
// A window reopened after startup completed appears at once: a brief splash is preferable to a delayed window.
// A failed read is reported by the startup wait below, which reads the same state.
void window.host.startup.get().then(state => { if (state.status === "ready") splash.reveal(); }, () => {});

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
    // The initial desktop bridge read has a deadline; backend phases remain subscribed, and the main process manages deadlines for actual work.
    waitForRuntime(window.host.startup, lifetime.signal, state => splash.stage(startupMessages[state.stage], state.detail), desktopSignal),
  ]);
  splash.stage(startupMessages.interface);
  // Page loading and frontend plugin preparation share an overall wait deadline; individual plugins have shorter preparation deadlines.
  const deadline = new AbortController();
  const signal = AbortSignal.any([lifetime.signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(new DOMException("Interface initialization timed out after 60 seconds.", "TimeoutError")), 60_000);
  try {
    await awaitStartup(import("./application").then(module => {
      signal.throwIfAborted();
      return module.startApplication(root, splash, signal);
    }), signal);
  } finally { clearTimeout(timer); }
}

const show = (content: ReactNode) => root.render(<HostI18nProvider>{content}<AfterCommit run={splash.handoff} /></HostI18nProvider>);

void boot().catch(error => {
  if (lifetime.signal.aborted) return;
  lifetime.abort();
  console.error("Application interface initialization failed.", error);
  reportRendererFailure("startup", error);
  const failure: StartupFailure = error instanceof StartupError ? error.failure
    : { reason: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "initialization",
      detail: error instanceof Error ? error.message : String(error) };
  show(<StartupScreen failure={failure} />);
});
