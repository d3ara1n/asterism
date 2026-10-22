import { mkdtemp, open, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUTPUT_CHAR_LIMIT, type ShellOutput } from "./contract.ts";

/** 按流过滤终端控制序列；跨 chunk 的序列只保留解析状态，不缓存任意长度正文。 */
class DisplayText {
  private state: "text" | "escape" | "csi" | "string" | "stringEscape" = "text";
  private carriage = false;
  push(text: string): string {
    let output = "";
    for (const char of text) {
      if (this.state === "string") { if (char === "\x07" || char === "\x9c") this.state = "text"; else if (char === "\x1b") this.state = "stringEscape"; continue; }
      if (this.state === "stringEscape") { this.state = char === "\\" ? "text" : "string"; continue; }
      if (this.state === "csi") { if (char >= "@" && char <= "~") this.state = "text"; continue; }
      if (this.state === "escape") {
        this.state = char === "[" ? "csi" : ["]", "P", "^", "_"].includes(char) ? "string"
          : char >= "\x20" && char <= "\x2f" ? "escape" : "text";
        continue;
      }
      if (char === "\x1b") { this.state = "escape"; continue; }
      if (char === "\x9b") { this.state = "csi"; continue; }
      if (char === "\x9d") { this.state = "string"; continue; }
      if (char === "\r") { output += "\n"; this.carriage = true; continue; }
      if (char === "\n" && this.carriage) { this.carriage = false; continue; }
      this.carriage = false;
      if (char === "\n" || char === "\t" || (char >= " " && !(char >= "\x7f" && char <= "\x9f"))) output += char;
    }
    return output;
  }
}

/** 完整的处理后文本仅在超限时写系统临时文件；历史消费者只取得有界尾部。 */
export class ShellOutputBuffer {
  private readonly decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
  private readonly display = { stdout: new DisplayText(), stderr: new DisplayText() };
  private tail = "";
  private totalChars = 0;
  private retainedChars = 0;
  private file: FileHandle | null = null;
  private path: string | null = null;
  constructor(private readonly temporaryRoot = tmpdir()) {}

  async append(stream: "stdout" | "stderr", bytes: Uint8Array): Promise<void> {
    await this.text(this.display[stream].push(this.decoders[stream].decode(bytes, { stream: true })));
  }
  private async text(text: string): Promise<void> {
    if (!text) return;
    const chars = Array.from(text);
    if (!this.file && this.totalChars + chars.length > OUTPUT_CHAR_LIMIT) {
      const directory = await mkdtemp(join(this.temporaryRoot, "atelier-exec-"));
      this.path = join(directory, "output.log");
      this.file = await open(this.path, "wx", 0o600);
      await this.file.writeFile(this.tail);
    }
    if (this.file) await this.file.writeFile(text);
    this.totalChars += chars.length;
    if (chars.length >= OUTPUT_CHAR_LIMIT) this.tail = chars.slice(-OUTPUT_CHAR_LIMIT).join("");
    else this.tail = Array.from(this.tail + text).slice(-OUTPUT_CHAR_LIMIT).join("");
    this.retainedChars = Math.min(this.totalChars, OUTPUT_CHAR_LIMIT);
  }
  snapshot(): ShellOutput {
    return { output: this.tail, truncation: this.path ? {
      totalChars: this.totalChars, retainedChars: this.retainedChars, file: this.path,
    } : null };
  }
  async finish(): Promise<ShellOutput> {
    try {
      for (const stream of ["stdout", "stderr"] as const) await this.text(this.display[stream].push(this.decoders[stream].decode()));
      return this.snapshot();
    } finally { await this.close(); }
  }
  async close(): Promise<void> {
    const file = this.file; this.file = null;
    await file?.close();
  }
}
