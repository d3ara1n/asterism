import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { SecretProtector } from "../shared/secrets.ts";

const referenceSchema = z.string().uuid();
export class CredentialVault {
  private root: string;
  readonly failures = new Set<string>();
  constructor(root: string, private readonly protector: SecretProtector) {
    this.root = join(root, "credentials");
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }
  private path(reference: string): string { return join(this.root, referenceSchema.parse(reference) + ".enc"); }
  async available(): Promise<boolean> { try { return await this.protector.available(); } catch { return false; } }
  exists(reference: string): boolean { return existsSync(this.path(reference)); }
  async write(value: string): Promise<string> {
    // 主进程在 encrypt 调用内检查系统保护，不重复往返查询可用性。
    const encrypted = await this.protector.encrypt(value);
    const reference = randomUUID();
    try {
      writeFileSync(this.path(reference), Buffer.from(encrypted, "base64"), { flag: "wx", mode: 0o600, flush: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") rmSync(this.path(reference), { force: true });
      throw new Error("The encrypted credential could not be saved.");
    }
    return reference;
  }
  async read(reference: string): Promise<string> {
    try {
      const encrypted = readFileSync(this.path(reference)).toString("base64");
      const value = await this.protector.decrypt(encrypted);
      this.failures.delete(reference);
      return value;
    } catch {
      this.failures.add(reference);
      throw new Error("The credential cannot be decrypted. Enter it again in settings.");
    }
  }
  remove(reference: string): void {
    try { unlinkSync(this.path(reference)); this.failures.delete(reference); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("The encrypted credential could not be removed."); }
  }
}
