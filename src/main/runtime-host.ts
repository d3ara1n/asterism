import { utilityProcess, type UtilityProcess } from "electron";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runtimeMessageSchema, type Command, type CommandResult, type RuntimeStatus } from "../shared/contracts.ts";
import { ConfigurationRequests, ConversationRequests, RuntimeRequests } from "./requests.ts";
import { conversationChangedSchema, conversationResponseSchema, type ConversationChanged, type ConversationCommand, type ConversationResult } from "../shared/conversation.ts";
import { configurationChangedSchema, configurationResponseSchema, type ConfigurationCommand, type ConfigurationResult } from "../shared/configuration.ts";
import { secretRequestSchema } from "../shared/secrets.ts";
import { handleSecretRequest } from "./secrets.ts";

export class RuntimeHost {
  private child: UtilityProcess | null = null;
  private requests: RuntimeRequests | null = null;
  private configurationRequests: ConfigurationRequests | null = null;
  private conversationRequests: ConversationRequests | null = null;
  private status: RuntimeStatus = "starting";
  constructor(private readonly onStatus: (status: RuntimeStatus) => void, private readonly onConfigurationChanged: () => void = () => {},
    private readonly onConversationChanged: (event: ConversationChanged) => void = () => {}) {}
  private setStatus(status: RuntimeStatus): void { this.status = status; this.onStatus(status); }

  start(entry: string, root: string): Promise<void> {
    mkdirSync(join(root, "logs"), { recursive: true });
    const log = createWriteStream(join(root, "logs", "runtime.log"), { flags: "a", mode: 0o600 });
    // 流错误必须有监听器，不能把日志故障变成未捕获异常。
    log.on("error", error => console.error("Runtime log write failed.", error));
    let child: UtilityProcess;
    try {
      child = utilityProcess.fork(entry, [root], { serviceName: "Weft task runtime", stdio: "pipe" });
    } catch (error) {
      log.end();
      this.setStatus("unavailable");
      return Promise.reject(error);
    }
    this.child = child;
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
    this.conversationRequests = new ConversationRequests(message => child.postMessage(message), () => {
      this.setStatus("unavailable");
      child.kill();
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.setStatus("unavailable");
        this.requests?.close();
        this.configurationRequests?.close();
        this.conversationRequests?.close();
        child.kill();
        reject(new Error("Task runtime initialization timed out."));
      }, 15_000);
      child.on("error", () => {
        clearTimeout(timeout);
        console.error("Task runtime encountered a fatal process error.");
        this.requests?.close();
        this.configurationRequests?.close();
        this.conversationRequests?.close();
        this.setStatus("unavailable");
        child.kill();
        reject(new Error("Task runtime encountered a fatal process error."));
      });
      child.on("message", raw => {
        if (secretRequestSchema.safeParse(raw).success) {
          void handleSecretRequest(raw).then(response => {
            if (response && this.child === child && this.status !== "stopping") {
              try { child.postMessage(response); } catch { /* 子进程可能已退出；不记录凭据消息。 */ }
            }
          });
          return;
        }
        if (configurationChangedSchema.safeParse(raw).success) { this.onConfigurationChanged(); return; }
        if (configurationResponseSchema.safeParse(raw).success) { this.configurationRequests?.receive(raw); return; }
        const conversation = conversationChangedSchema.safeParse(raw);
        if (conversation.success) { this.onConversationChanged(conversation.data); return; }
        if (conversationResponseSchema.safeParse(raw).success) { this.conversationRequests?.receive(raw); return; }
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
          this.conversationRequests?.close();
          child.kill();
          reject(new Error(parsed.data.message));
        } else this.requests?.receive(raw);
      });
      child.once("exit", code => {
        clearTimeout(timeout);
        log.end();
        this.child = null;
        this.requests?.close();
        this.configurationRequests?.close();
        this.conversationRequests?.close();
        if (this.status !== "stopping") this.setStatus("unavailable");
        reject(new Error("Task runtime exited with code " + code));
      });
    });
  }

  execute(command: Command): Promise<CommandResult> {
    if (this.status !== "ready" || !this.requests) return Promise.resolve({
      ok: false, error: { code: "unavailable", message: "The workspace is unavailable. Restart Weft to reopen it." },
    });
    return this.requests.execute(command);
  }

  configure(command: ConfigurationCommand): Promise<ConfigurationResult> {
    if (this.status !== "ready" || !this.configurationRequests) return Promise.resolve({
      ok: false, error: { code: "unavailable", message: "Configuration service is unavailable. Restart Weft." },
    });
    return this.configurationRequests.execute(command);
  }

  converse(command: ConversationCommand): Promise<ConversationResult> {
    if (this.status !== "ready" || !this.conversationRequests) return Promise.resolve({
      ok: false, error: { code: "unavailable", message: "Conversation service is unavailable. Restart Weft." },
    });
    return this.conversationRequests.execute(command);
  }

  stop(): Promise<void> {
    this.setStatus("stopping");
    this.requests?.close("Weft is shutting down.");
    this.configurationRequests?.close("Weft is shutting down.");
    this.conversationRequests?.close("Weft is shutting down.");
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
