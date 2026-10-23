import { nanoid } from "nanoid";

/** 重试相同输入复用提交身份；收到受理结果后下一次发送使用新身份。 */
export class SubmissionIdentity {
  private pending: { signature: string; id: string } | null = null;
  forInput(value: unknown): string {
    const signature = JSON.stringify(value);
    if (this.pending?.signature !== signature) this.pending = { signature, id: nanoid(16) };
    return this.pending.id;
  }
  accepted(): void { this.pending = null; }
}
