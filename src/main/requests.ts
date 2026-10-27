import { randomUUID } from "node:crypto";
import { applicationBrand } from "../shared/application.ts";
import { protocolVersion, runtimeMessageSchema, type Command, type CommandResult } from "../shared/contracts.ts";

/** Workspace requests on the main-process control channel; send once, never replay potentially committed commands after disconnect, and treat timeout as an unresponsive task process. */
export class RuntimeRequests {
  private pending = new Map<string, { resolve: (value: CommandResult) => void; timer: ReturnType<typeof setTimeout> }>();
  private available = true;
  constructor(private readonly send: (message: unknown) => void, private readonly onTimeout: () => void, private readonly timeoutMs = 15_000) {}
  execute(command: Command): Promise<CommandResult> {
    if (!this.available) return Promise.resolve(unavailable(`The task runtime is unavailable. Restart ${applicationBrand.en} to reopen the workspace.`));
    return new Promise(resolve => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.close(`The runtime stopped responding. The command may have completed; restart ${applicationBrand.en} and inspect the workspace before retrying.`);
        this.onTimeout();
      }, this.timeoutMs);
      this.pending.set(id, { resolve, timer });
      try { this.send({ version: protocolVersion, id, command }); }
      catch { this.close(`The task runtime disconnected. Restart ${applicationBrand.en} before retrying.`); }
    });
  }
  receive(raw: unknown): void {
    const parsed = runtimeMessageSchema.safeParse(raw);
    if (!parsed.success || parsed.data.kind !== "response") return;
    const request = this.pending.get(parsed.data.id);
    if (!request) return;
    clearTimeout(request.timer); this.pending.delete(parsed.data.id); request.resolve(parsed.data.result);
  }
  close(message = `The task runtime has stopped. Restart ${applicationBrand.en} to reopen the workspace.`): void {
    this.available = false;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.resolve(unavailable(message)); }
    this.pending.clear();
  }
}
function unavailable(message: string): CommandResult { return { ok: false, error: { code: "unavailable", message } }; }
