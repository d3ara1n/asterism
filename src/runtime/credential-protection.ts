import { randomUUID } from "node:crypto";
import { credentialResponseSchema, type CredentialProtection } from "../shared/credential-protection.ts";

/** Only the main process can access the OS credential protection service. */
export class RuntimeCredentialProtection implements CredentialProtection {
  private readonly pending = new Map<string, (value: string | null) => void>();
  constructor(private readonly send: (value: unknown) => void) {}
  protect(value: string) { return this.request("protect", value); }
  unprotect(value: string) { return this.request("unprotect", value); }
  private async request(operation: "protect" | "unprotect", value: string) {
    const id = randomUUID();
    const result = await new Promise<string | null>((resolve, reject) => {
      this.pending.set(id, resolve);
      try { this.send({ kind: "credential.request", id, operation, value }); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
    if (result === null) throw new Error("Protected credential storage is unavailable.");
    return result;
  }
  receive(value: unknown) {
    const parsed = credentialResponseSchema.safeParse(value);
    if (!parsed.success) return;
    this.pending.get(parsed.data.id)?.(parsed.data.value);
    this.pending.delete(parsed.data.id);
  }
}
