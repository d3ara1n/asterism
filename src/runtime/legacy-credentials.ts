import { randomUUID } from "node:crypto";
import { legacyCredentialResponseSchema } from "../shared/legacy-credentials.ts";

/** The preparation process lifetime owns these requests, including user interaction with Keychain. */
export class LegacyCredentials {
  private readonly pending = new Map<string, { resolve(value: string): void; reject(error: Error): void }>();
  constructor(private readonly send: (message: unknown) => void) {}
  decrypt(ciphertext: string): Promise<string> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ kind: "credential.migrate", id, ciphertext });
    });
  }
  receive(raw: unknown): void {
    const parsed = legacyCredentialResponseSchema.safeParse(raw);
    if (!parsed.success) return;
    const request = this.pending.get(parsed.data.id);
    if (!request) return;
    this.pending.delete(parsed.data.id);
    if (parsed.data.value === null) request.reject(new Error("Legacy credential decryption failed."));
    else request.resolve(parsed.data.value);
  }
}
