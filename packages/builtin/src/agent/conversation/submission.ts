import { nanoid } from "nanoid";

/** Retrying the same input reuses its submission identity; after an acceptance result is received, the next send uses a new identity. */
export class SubmissionIdentity {
  private pending: { signature: string; id: string } | null = null;
  forInput(value: unknown): string {
    const signature = JSON.stringify(value);
    if (this.pending?.signature !== signature) this.pending = { signature, id: nanoid(16) };
    return this.pending.id;
  }
  accepted(): void { this.pending = null; }
}
