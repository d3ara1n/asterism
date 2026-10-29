import type { keyNames } from "./contract.ts";

export function keySequence(key: typeof keyNames[number], applicationCursor: boolean): string {
  const prefix = applicationCursor ? "\x1bO" : "\x1b[";
  const keys: Record<typeof keyNames[number], string> = {
    Enter: "\r", Tab: "\t", Escape: "\x1b", Backspace: "\x7f", Delete: "\x1b[3~", Up: `${prefix}A`, Down: `${prefix}B`, Right: `${prefix}C`, Left: `${prefix}D`,
    Home: `${prefix}H`, End: `${prefix}F`, PageUp: "\x1b[5~", PageDown: "\x1b[6~", "Ctrl+C": "\x03", "Ctrl+D": "\x04", "Ctrl+Z": "\x1a", "Ctrl+L": "\x0c", "Ctrl+A": "\x01", "Ctrl+E": "\x05", "Ctrl+U": "\x15", "Ctrl+K": "\x0b",
  };
  return keys[key];
}
