import { app, ipcMain } from "electron";
import Store from "electron-store";
import * as Sentry from "@sentry/electron/main";
import { applicationStorage, preferenceVersion } from "../shared/application.ts";
import { crashReportsArgument, crashReportsGetChannel, crashReportsSetChannel, type CrashReportsState } from "../shared/crash-reports.ts";
import { crashReportEvent } from "./crash-report-event.ts";

// A Sentry DSN is a public ingestion address, not an account or CI credential.
const dsn = "https://d1ec123feb28efb05c3c5182a1403bf2@o941379.ingest.us.sentry.io/4512458484416512";
const integrations = new Set(["SentryMinidump", "NormalizePaths", "EventFilters", "OnUncaughtException", "OnUnhandledRejection"]);

export class CrashReports {
  private store: Store<{ version: number; enabled: boolean }> | undefined;
  private enabled = false;
  private active = false;

  /** After setting userData and obtaining the instance lock, but before creating windows or utility processes. */
  start(): void {
    try {
      this.store = new Store({ cwd: app.getPath("userData"), name: applicationStorage.crashReportsStore,
        defaults: { version: preferenceVersion, enabled: false }, clearInvalidConfig: true });
      this.enabled = this.store.get("enabled") === true;
      if (!this.enabled) return;
      Sentry.init({
        dsn, ipcMode: Sentry.IPCMode.Classic, environment: app.isPackaged ? "production" : "development",
        release: `asterism@${app.getVersion()}`, sendClientReports: false, maxBreadcrumbs: 0,
        dataCollection: { userInfo: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, cookies: false, stackFrameVariables: false, frameContextLines: 0 },
        integrations: defaults => defaults.filter(integration => integrations.has(integration.name)),
        beforeSend: (event, hint) => {
          if (!this.enabled) return null;
          // The native minidump is the only attachment approved by this preference.
          hint.attachments = event.platform === "native" ? hint.attachments?.filter(attachment => attachment.attachmentType === "event.minidump") : [];
          return crashReportEvent(event);
        },
        transport: options => {
          const transport = Sentry.makeElectronTransport(options);
          return {
            send: envelope => {
              if (!this.enabled || !envelope[1].some(([item]) => item.type === "event") ||
                !envelope[1].every(([item]) => item.type === "event" || item.type === "attachment" && item.attachment_type === "event.minidump")) {
                return Promise.resolve({});
              }
              delete envelope[0].trace;
              return transport.send(envelope);
            },
            flush: timeout => transport.flush(timeout),
          };
        },
      });
      this.active = true;
    } catch (error) { console.error("Crash reporting could not be initialized.", error); }
  }

  arguments(): string[] { return this.active ? [crashReportsArgument] : []; }
  capture(error: unknown, stage: "startup" | "preload"): void {
    if (this.active && this.enabled) Sentry.captureException(error, { tags: { stage, "event.process": "browser" } });
  }
  async flush(): Promise<void> { if (this.active && this.enabled) await Sentry.flush(1_500); }

  private state(): CrashReportsState { return { enabled: this.enabled, restartRequired: this.enabled !== this.active }; }
  serve(trusted: (event: Electron.IpcMainInvokeEvent) => boolean): () => void {
    const authorize = (event: Electron.IpcMainInvokeEvent) => { if (!trusted(event)) throw new Error("Untrusted application frame."); };
    ipcMain.handle(crashReportsGetChannel, event => { authorize(event); return this.state(); });
    ipcMain.handle(crashReportsSetChannel, (event, enabled: unknown) => {
      authorize(event);
      if (typeof enabled !== "boolean" || !this.store) throw new Error("Crash reporting preference could not be saved.");
      this.store.set("enabled", enabled);
      this.enabled = enabled;
      return this.state();
    });
    return () => { ipcMain.removeHandler(crashReportsGetChannel); ipcMain.removeHandler(crashReportsSetChannel); };
  }
}
