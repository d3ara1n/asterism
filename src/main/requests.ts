import { randomUUID } from "node:crypto";
import { protocolVersion, runtimeMessageSchema, type Command, type CommandResult } from "../shared/contracts.ts";

const unavailable = (message: string): CommandResult => ({ ok: false, error: { code: "unavailable", message } });

/** 请求仅发送一次；超时或断线后不重放可能已产生副作用的命令。 */
export class RuntimeRequests {
  private pending = new Map<string, { resolve: (value: CommandResult) => void; timer: ReturnType<typeof setTimeout> }>();
  private available = true;
  constructor(private readonly send: (message: unknown) => void, private readonly onTimeout: () => void, private readonly timeoutMs = 15_000) {}
  execute(command: Command): Promise<CommandResult> {
    if (!this.available) return Promise.resolve(unavailable("The task runtime is unavailable. Restart Weft to reopen the workspace."));
    return new Promise(resolve => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.close("The runtime stopped responding. The command may have completed; restart Weft and inspect the workspace before retrying.");
        this.onTimeout();
      }, this.timeoutMs);
      this.pending.set(id, { resolve, timer });
      try { this.send({ version: protocolVersion, id, command }); }
      catch { this.close("The task runtime disconnected. Restart Weft before retrying."); }
    });
  }
  receive(raw: unknown): void {
    const parsed = runtimeMessageSchema.safeParse(raw);
    if (!parsed.success || parsed.data.kind !== "response") return;
    const request = this.pending.get(parsed.data.id);
    if (!request) return;
    clearTimeout(request.timer);
    this.pending.delete(parsed.data.id);
    request.resolve(parsed.data.result);
  }
  close(message = "The task runtime has stopped. Restart Weft to reopen the workspace."): void {
    this.available = false;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.resolve(unavailable(message));
    }
    this.pending.clear();
  }
}
