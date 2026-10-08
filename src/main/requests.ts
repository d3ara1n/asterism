import { randomUUID } from "node:crypto";
import { protocolVersion, runtimeMessageSchema, type Command, type CommandResult } from "../shared/contracts.ts";
import { configurationVersion, configurationResponseSchema, type ConfigurationCommand, type ConfigurationResult } from "../shared/configuration.ts";
import { conversationResponseSchema, conversationVersion, type ConversationCommand, type ConversationResult } from "../shared/conversation.ts";

/** 独立能力通道共用请求生命周期；只发送一次，断线不重放可能已提交的命令。 */
class PendingRequests<C, R> {
  private pending = new Map<string, { resolve: (value: R) => void; timer: ReturnType<typeof setTimeout> }>();
  private available = true;
  constructor(private readonly send: (message: unknown) => void, private readonly onTimeout: () => void,
    private readonly encode: (id: string, command: C) => unknown,
    private readonly decode: (raw: unknown) => { id: string; result: R } | null,
    private readonly unavailable: (message: string) => R, private readonly timeoutMs: number) {}
  execute(command: C): Promise<R> {
    if (!this.available) return Promise.resolve(this.unavailable("The task runtime is unavailable. Restart Weft to reopen the workspace."));
    return new Promise(resolve => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.close("The runtime stopped responding. The command may have completed; restart Weft and inspect the workspace before retrying.");
        this.onTimeout();
      }, this.timeoutMs);
      this.pending.set(id, { resolve, timer });
      try { this.send(this.encode(id, command)); }
      catch { this.close("The task runtime disconnected. Restart Weft before retrying."); }
    });
  }
  receive(raw: unknown): void {
    const response = this.decode(raw);
    if (!response) return;
    const request = this.pending.get(response.id);
    if (!request) return;
    clearTimeout(request.timer); this.pending.delete(response.id); request.resolve(response.result);
  }
  close(message = "The task runtime has stopped. Restart Weft to reopen the workspace."): void {
    this.available = false;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.resolve(this.unavailable(message)); }
    this.pending.clear();
  }
}
export class RuntimeRequests extends PendingRequests<Command, CommandResult> {
  constructor(send: (message: unknown) => void, onTimeout: () => void, timeoutMs = 15_000) {
    super(send, onTimeout, (id, command) => ({ version: protocolVersion, id, command }), raw => {
      const parsed = runtimeMessageSchema.safeParse(raw);
      return parsed.success && parsed.data.kind === "response" ? parsed.data : null;
    }, message => ({ ok: false, error: { code: "unavailable", message } }), timeoutMs);
  }
}
export class ConfigurationRequests extends PendingRequests<ConfigurationCommand, ConfigurationResult> {
  // 系统保护查询与加密各有 10s 私有请求预算；配置通道还需容纳排队中的一次读取。
  constructor(send: (message: unknown) => void, onTimeout: () => void, timeoutMs = 45_000) {
    super(send, onTimeout, (id, command) => ({ kind: "configuration.request", version: configurationVersion, id, command }), raw => {
      const parsed = configurationResponseSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    }, message => ({ ok: false, error: { code: "unavailable", message } }), timeoutMs);
  }
}
export class ConversationRequests extends PendingRequests<ConversationCommand, ConversationResult> {
  constructor(send: (message: unknown) => void, onTimeout: () => void, timeoutMs = 45_000) {
    super(send, onTimeout, (id, command) => ({ kind: "conversation.request", version: conversationVersion, id, command }), raw => {
      const parsed = conversationResponseSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    }, message => ({ ok: false, error: { code: "unavailable", message } }), timeoutMs);
  }
}
