import { utilityProcess, type UtilityProcess } from "electron";
import { applicationBrand, applicationStorage } from "../shared/application.ts";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runtimeMessageSchema, type Command, type CommandResult, type RuntimeStatus } from "../shared/contracts.ts";
import { ConfigurationRequests, SessionRequests, RuntimeRequests, PluginConfigurationRequests, ContentRequests } from "./requests.ts";
import { sessionChangedSchema, sessionResponseSchema, type SessionChanged, type SessionCommand, type SessionResult } from "../shared/session.ts";
import { configurationChangedSchema, configurationResponseSchema, type ConfigurationCommand, type ConfigurationResult } from "../shared/configuration.ts";
import { secretRequestSchema } from "../shared/secrets.ts";
import { handleSecretRequest } from "./secrets.ts";
import { pluginConfigurationChangedSchema, pluginConfigurationResponseSchema, type PluginConfigurationCommand, type PluginConfigurationResult } from "../shared/plugin-configuration.ts";
import { objectStreamSchema, type ObjectStream } from "../shared/object-stream.ts";
import { contentResponseSchema, type ContentCommand, type ContentResult } from "../shared/content.ts";
import { eventRuntimeFrameSchema, pluginEventsVersion, type EventControl, type EventFrame } from "../shared/plugin-events.ts";

export class RuntimeHost {
  private child: UtilityProcess | null = null;
  private requests: RuntimeRequests | null = null;
  private configurationRequests: ConfigurationRequests | null = null;
  private sessionRequests: SessionRequests | null = null;
  private pluginConfigurationRequests: PluginConfigurationRequests | null = null;
  private contentRequests: ContentRequests | null = null;
  private status: RuntimeStatus = "starting";
  constructor(private readonly onStatus: (status: RuntimeStatus) => void, private readonly onConfigurationChanged: () => void = () => {},
    private readonly onSessionChanged: (event: SessionChanged) => void = () => {},
    private readonly onStream: (event: ObjectStream) => void = () => {},
    private readonly onPluginConfigurationChanged: (pluginId: string) => void = () => {},
    private readonly onEventFrame: (frame: EventFrame) => void = () => {}) {}
  private setStatus(status: RuntimeStatus): void { this.status = status; this.onStatus(status); }

  start(entry: string, root: string): Promise<void> {
    mkdirSync(join(root, applicationStorage.logsDirectory), { recursive: true });
    const log = createWriteStream(join(root, applicationStorage.logsDirectory, applicationStorage.runtimeLogFile), { flags: "a", mode: 0o600 });
    // 流错误必须有监听器，不能把日志故障变成未捕获异常。
    log.on("error", error => console.error("Runtime log write failed.", error));
    let child: UtilityProcess;
    try {
      child = utilityProcess.fork(entry, [root], { serviceName: `${applicationBrand.en} task runtime`, stdio: "pipe" });
    } catch (error) {
      log.end();
      this.setStatus("unavailable");
      return Promise.reject(error);
    }
    this.child = child;
    this.contentRequests = new ContentRequests(message => child.postMessage(message), () => {
      this.setStatus("unavailable"); child.kill();
    });
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    this.requests = new RuntimeRequests(message => child.postMessage(message), () => {
      this.setStatus("unavailable");
      child.kill();
    });
    this.configurationRequests = new ConfigurationRequests(message => child.postMessage(message), () => {
      this.setStatus("unavailable");
      child.kill();
    });
    this.sessionRequests = new SessionRequests(message => child.postMessage(message), () => {
      this.setStatus("unavailable");
      child.kill();
    });
    this.pluginConfigurationRequests = new PluginConfigurationRequests(message => child.postMessage(message), () => {
      this.setStatus("unavailable");
      child.kill();
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.setStatus("unavailable");
        this.requests?.close();
        this.configurationRequests?.close();
        this.pluginConfigurationRequests?.close();
        this.contentRequests?.close();
        this.sessionRequests?.close();
        child.kill();
        reject(new Error("Task runtime initialization timed out."));
      }, 15_000);
      child.on("error", () => {
        clearTimeout(timeout);
        console.error("Task runtime encountered a fatal process error.");
        this.requests?.close();
        this.configurationRequests?.close();
        this.pluginConfigurationRequests?.close();
        this.contentRequests?.close();
        this.sessionRequests?.close();
        this.setStatus("unavailable");
        child.kill();
        reject(new Error("Task runtime encountered a fatal process error."));
      });
      child.on("message", raw => {
        if (raw?.kind === "plugin-events.frame") {
          const parsed = eventRuntimeFrameSchema.safeParse(raw);
          if (parsed.success) this.onEventFrame(parsed.data.frame);
          return;
        }
        if (secretRequestSchema.safeParse(raw).success) {
          void handleSecretRequest(raw).then(response => {
            if (response && this.child === child && this.status !== "stopping") {
              try { child.postMessage(response); } catch { /* 子进程可能已退出；不记录凭据消息。 */ }
            }
          });
          return;
        }
        if (configurationChangedSchema.safeParse(raw).success) { this.onConfigurationChanged(); return; }
        const pluginChanged = pluginConfigurationChangedSchema.safeParse(raw);
        if (pluginChanged.success) { this.onPluginConfigurationChanged(pluginChanged.data.id); return; }
        if (contentResponseSchema.safeParse(raw).success) { this.contentRequests?.receive(raw); return; }
        if (configurationResponseSchema.safeParse(raw).success) { this.configurationRequests?.receive(raw); return; }
        if (pluginConfigurationResponseSchema.safeParse(raw).success) { this.pluginConfigurationRequests?.receive(raw); return; }
        const stream = objectStreamSchema.safeParse(raw);
        if (stream.success) { this.onStream(stream.data); return; }
        const session = sessionChangedSchema.safeParse(raw);
        if (session.success) { this.onSessionChanged(session.data); return; }
        if (sessionResponseSchema.safeParse(raw).success) { this.sessionRequests?.receive(raw); return; }
        const parsed = runtimeMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        if (parsed.data.kind === "ready") {
          clearTimeout(timeout);
          if (this.status !== "starting") return;
          this.setStatus("ready");
          resolve();
        } else if (parsed.data.kind === "fatal") {
          clearTimeout(timeout);
          this.setStatus("unavailable");
          this.requests?.close();
          this.configurationRequests?.close();
          this.pluginConfigurationRequests?.close();
          this.contentRequests?.close();
          this.sessionRequests?.close();
          child.kill();
          reject(Object.assign(new Error(parsed.data.message), { reason: parsed.data.reason, directory: parsed.data.directory }));
        } else this.requests?.receive(raw);
      });
      child.once("exit", code => {
        clearTimeout(timeout);
        log.end();
        this.child = null;
        this.requests?.close();
        this.configurationRequests?.close();
        this.pluginConfigurationRequests?.close();
        this.contentRequests?.close();
        this.sessionRequests?.close();
        if (this.status !== "stopping") this.setStatus("unavailable");
        reject(new Error("Task runtime exited with code " + code));
      });
    });
  }

  execute(command: Command): Promise<CommandResult> {
    if (this.status !== "ready" || !this.requests) return Promise.resolve({
      ok: false, error: { code: "unavailable", message: `The workspace is unavailable. Restart ${applicationBrand.en} to reopen it.` },
    });
    return this.requests.execute(command);
  }

  events(control: EventControl): void {
    if (this.child && this.status === "ready") {
      try { this.child.postMessage({ kind: "plugin-events.control", version: pluginEventsVersion, control }); return; }
      catch { this.setStatus("unavailable"); }
    }
    if (control.type === "subscribe") this.onEventFrame({ type: "closed", id: control.id, end: { reason: "unavailable" } });
  }

  configure(command: ConfigurationCommand): Promise<ConfigurationResult> {
    if (this.status !== "ready" || !this.configurationRequests) return Promise.resolve({
      ok: false, error: { code: "unavailable", message: `Configuration service is unavailable. Restart ${applicationBrand.en}.` },
    });
    return this.configurationRequests.execute(command);
  }

  session(command: SessionCommand): Promise<SessionResult> {
    if (this.status !== "ready" || !this.sessionRequests) return Promise.resolve({
      ok: false, error: { code: "unavailable", message: `Session service is unavailable. Restart ${applicationBrand.en}.` },
    });
    return this.sessionRequests.execute(command);
  }
  configurePlugin(command: PluginConfigurationCommand): Promise<PluginConfigurationResult> {
    if (this.status !== "ready" || !this.pluginConfigurationRequests) return Promise.resolve({
      ok: false, error: { code: "unavailable", message: "Plugin configuration service is unavailable." },
    });
    return this.pluginConfigurationRequests.execute(command);
  }
  content(command: ContentCommand): Promise<ContentResult> {
    if (this.status !== "ready" || !this.contentRequests) return Promise.resolve({
      ok: false, error: { code: "unavailable", message: "Content transfer is unavailable." },
    });
    return this.contentRequests.execute(command);
  }

  stop(): Promise<void> {
    this.setStatus("stopping");
    this.requests?.close(`${applicationBrand.en} is shutting down.`);
    this.configurationRequests?.close(`${applicationBrand.en} is shutting down.`);
    this.pluginConfigurationRequests?.close(`${applicationBrand.en} is shutting down.`);
    this.contentRequests?.close(`${applicationBrand.en} is shutting down.`);
    this.sessionRequests?.close(`${applicationBrand.en} is shutting down.`);
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise(resolve => {
      const timeout = setTimeout(() => { child.kill(); resolve(); }, 5_000);
      child.once("exit", () => { clearTimeout(timeout); resolve(); });
      try { child.postMessage({ kind: "shutdown" }); }
      catch { clearTimeout(timeout); child.kill(); resolve(); }
    });
  }
}
