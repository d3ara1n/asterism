// 移植自 @d3ara1n/pi-hashline-edit 的 MIT 核心；来源与许可见 README.md。
import type { LineEnding } from "./types.ts";

export function splitLines(text: string): string[] {
  if (text === "") return [];
  const raw = text.split("\n");
  const lines = raw.map((line, i) => i < raw.length - 1 && line.endsWith("\r") ? line.slice(0, -1) : line);
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

export function detectLineEnding(text: string): LineEnding {
  return text.includes("\r\n") ? "crlf" : "lf";
}

export function hasFinalNewline(text: string): boolean {
  return text === "" || text.endsWith("\n");
}
