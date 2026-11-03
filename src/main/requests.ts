import { randomUUID } from "node:crypto";
import { applicationBrand } from "../shared/application.ts";
import { protocolVersion, runtimeMessageSchema, type Command, type CommandResult } from "../shared/contracts.ts";

/** Workspace requests on the main-process control channel; send once, wait without a deadline, and never replay potentially committed commands after disconnect. */
export class RuntimeRequests {
  private pending = new Map<string, (value: CommandResult) => void>();
  private available = true;
  constructor(private readonly send: (message: unknown) => void) {}
  execute(command: Command): Promise<CommandResult> {
    if (!this.available) return Promise.resolve(unavailable(`The task runtime is unavailable. Restart ${applicationBrand.en} to reopen the workspace.`));
    return new Promise(resolve => {
      const id = randomUUID();
      this.pending.set(id, resolve);
      try { this.send({ version: protocolVersion, id, command }); }
      catch { this.close(`The task runtime disconnected. Restart ${applicationBrand.en} before retrying.`); }
    });
  }
  receive(raw: unknown): void {
    const parsed = runtimeMessageSchema.safeParse(raw);
    if (!parsed.success || parsed.data.kind !== "response") return;
    const resolve = this.pending.get(parsed.data.id);
    if (!resolve) return;
    this.pending.delete(parsed.data.id); resolve(parsed.data.result);
  }
  close(message = `The task runtime has stopped. Restart ${applicationBrand.en} to reopen the workspace.`): void {
    this.available = false;
    for (const resolve of this.pending.values()) resolve(unavailable(message));
    this.pending.clear();
  }
}
function unavailable(message: string): CommandResult { return { ok: false, error: { code: "unavailable", message } }; }
