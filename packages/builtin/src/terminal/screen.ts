import headless from "@xterm/headless";
import serialize from "@xterm/addon-serialize";
import type { TerminalImage } from "./contract.ts";
import { RawBuffer } from "./raw-buffer.ts";

const { Terminal } = headless;
const { SerializeAddon } = serialize;
const SCROLLBACK_LINES = 5000;
const terminalPalette = ["#1e1e1e", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5", "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"];
const foreground = "#d4d4d4", background = "#1e1e1e";

/** Backend character grid, raw buffer, and text/image projections; callers read on the output parsing chain. */
export class HeadlessScreen {
  readonly terminal: InstanceType<typeof Terminal>;
  private readonly serializer = new SerializeAddon();
  private readonly raw = new RawBuffer();
  private cursorVisible = true;

  constructor(size: { cols: number; rows: number }) {
    this.terminal = new Terminal({ ...size, scrollback: SCROLLBACK_LINES, allowProposedApi: true });
    this.terminal.loadAddon(this.serializer);
    for (const final of ["h", "l"]) this.terminal.parser.registerCsiHandler({ prefix: "?", final }, params => {
      if (params.includes(25)) this.cursorVisible = final === "h";
      return false;
    });
  }

  get size() { return { cols: this.terminal.cols, rows: this.terminal.rows }; }

  write(data: string, done: () => void) {
    this.raw.push(data);
    this.terminal.write(data, done);
  }

  snapshot() {
    return { ...this.size, data: this.serializer.serialize() };
  }

  read(source: "screen" | "history" | "raw", offset?: number, limit?: number) {
    const buffer = this.terminal.buffer.active;
    const content = source === "raw" ? this.raw.read(offset, limit) : this.readLines(source, offset, limit);
    return { source, ...content, ...this.size, cursor: { x: buffer.cursorX, y: buffer.cursorY } };
  }

  private readLines(source: "screen" | "history", offset?: number, limit = 100) {
    const buffer = this.terminal.buffer.active;
    const from = source === "screen" ? buffer.baseY : Math.max(0, Math.min(offset ?? Math.max(0, buffer.length - limit), buffer.length));
    const to = Math.min(buffer.length, from + (source === "screen" ? this.terminal.rows : Math.min(limit, 2000)));
    const text = Array.from({ length: to - from }, (_, row) => buffer.getLine(from + row)?.translateToString(source !== "screen") ?? "").join("\n");
    return { text, offset: from, nextOffset: to, truncated: source === "history" && (from > 0 || to < buffer.length) };
  }

  image(): TerminalImage {
    const buffer = this.terminal.buffer.active, cell = buffer.getNullCell();
    const cells = Array.from({ length: this.terminal.rows }, (_, y) => {
      const line = buffer.getLine(buffer.baseY + y);
      return Array.from({ length: this.terminal.cols }, (_, x) => {
        if (!line?.getCell(x, cell)) return { text: "", width: 1, fg: foreground, bg: background, bold: false, italic: false, underline: false, strike: false };
        let fg = color(cell.getFgColor(), cell.isFgRGB(), cell.isFgDefault(), foreground);
        let bg = color(cell.getBgColor(), cell.isBgRGB(), cell.isBgDefault(), background);
        if (cell.isInverse()) [fg, bg] = [bg, fg];
        return { text: cell.isInvisible() ? "" : cell.getChars(), width: cell.getWidth(), fg, bg,
          bold: !!cell.isBold(), italic: !!cell.isItalic(), underline: !!cell.isUnderline(), strike: !!cell.isStrikethrough() };
      });
    });
    return { ...this.size, cursor: { x: buffer.cursorX, y: buffer.cursorY, visible: this.cursorVisible }, cells };
  }
}

function color(value: number, rgb: boolean, isDefault: boolean, fallback: string): string {
  if (isDefault || value < 0) return fallback;
  if (rgb) return `#${value.toString(16).padStart(6, "0")}`;
  if (value < 16) return terminalPalette[value]!;
  if (value >= 232) {
    const gray = (8 + (value - 232) * 10).toString(16).padStart(2, "0");
    return `#${gray}${gray}${gray}`;
  }
  const levels = [0, 95, 135, 175, 215, 255], index = value - 16;
  return `#${[Math.floor(index / 36), Math.floor(index / 6) % 6, index % 6].map(component => levels[component]!.toString(16).padStart(2, "0")).join("")}`;
}
