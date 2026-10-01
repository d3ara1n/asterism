import { randomUUID } from "node:crypto";
import { secretResponseSchema, type SecretProtector } from "../shared/secrets.ts";

export class SecretClient implements SecretProtector {
  private pending = new Map<string, { resolve: (value: string | boolean) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private readonly send: (message: unknown) => void) {}
  private request(action: "available" | "encrypt" | "decrypt", value?: string): Promise<string | boolean> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Credential protection timed out.")); }, 10_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ kind: "secret.request", id, action, ...(value === undefined ? {} : { value }) }); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new Error("Credential protection is unavailable.")); }
    });
  }
  async available(): Promise<boolean> { return (await this.request("available")) === true; }
  async encrypt(value: string): Promise<string> {
    const result = await this.request("encrypt", value);
    if (typeof result !== "string") throw new Error("Credential encryption failed.");
    return result;
  }
  async decrypt(value: string): Promise<string> {
    const result = await this.request("decrypt", value);
    if (typeof result !== "string") throw new Error("Credential decryption failed.");
    return result;
  }
  receive(raw: unknown): boolean {
    const parsed = secretResponseSchema.safeParse(raw);
    if (!parsed.success) return false;
    const pending = this.pending.get(parsed.data.id);
    if (!pending) return true;
    clearTimeout(pending.timer); this.pending.delete(parsed.data.id);
    if (parsed.data.ok && parsed.data.value !== undefined) pending.resolve(parsed.data.value);
    else pending.reject(new Error("Credential protection is unavailable."));
    return true;
  }
  close(): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Credential protection stopped.")); }
    this.pending.clear();
  }
}
