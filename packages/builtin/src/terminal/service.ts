import * as pty from "node-pty";
import headless from "@xterm/headless";
import serialize from "@xterm/addon-serialize";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ShellSettings } from "../shell/contract.ts";
import { resolveShell } from "../shell/profiles.ts";
import { prepareInteractiveShell } from "./integration.ts";
import type { TerminalConfig, TerminalFrame, TerminalImage, TerminalState, TerminalStatus, keyNames } from "./contract.ts";

const { Terminal } = headless;
const { SerializeAddon } = serialize;
const execute = promisify(execFile);
export const SCROLLBACK_LINES = 5000;
export const RAW_CHARACTERS = 1024 * 1024;
export const terminalPalette = ["#1e1e1e", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5", "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"];
const foreground = "#d4d4d4", background = "#1e1e1e";

export class TerminalError extends Error { constructor(readonly code: string, message: string) { super(message); } }

/** 单次外部终端实例；寿命与工具等待、卡片挂载和会话查看分别管理。 */
export class TerminalSession {
  private readonly terminal = new Terminal({ cols: 100, rows: 28, scrollback: SCROLLBACK_LINES, allowProposedApi: true });
  private readonly serializer = new SerializeAddon();
  private process?: pty.IPty;
  private readonly token = randomUUID();
  private readonly listeners = new Set<() => void>();
  private readonly lifetime = new AbortController();
  private ready = false;
  private submittedBeforePrompt = false;
  private starting?: Promise<void>;
  private disposing?: Promise<void>;
  private integrationCleanup?: () => Promise<void>;
  private parsed = Promise.resolve();
  private exited = Promise.resolve();
  private resolveExit?: () => void;
  private sequence = 0;
  private raw = "";
  private rawEnd = 0;
  private cursorVisible = true;
  private statusValue: TerminalStatus = { state: "inactive", shell: null, integration: false, exitCode: null, error: null };

  constructor(readonly config: TerminalConfig, private readonly settings: () => ShellSettings, private readonly root: string,
    private readonly changed: () => void, private readonly frame: (frame: TerminalFrame) => void) {
    this.terminal.loadAddon(this.serializer);
    this.terminal.parser.registerOscHandler(777, data => {
      const prefix = `atelier;${this.token};`;
      if (!data.startsWith(prefix)) return false;
      const state = data.slice(prefix.length);
      if (state === "idle" || state === "running") {
        const initialPrompt = !this.ready && state === "idle";
        this.ready = true;
        this.setState(initialPrompt && this.submittedBeforePrompt ? "unknown" : state, { integration: true });
      }
      return true;
    });
    // 后台是终端协议响应的唯一发送者；前端副本仅接收用户输入。
    this.terminal.onData(data => { if (!this.lifetime.signal.aborted) this.process?.write(data); });
    for (const final of ["h", "l"]) this.terminal.parser.registerCsiHandler({ prefix: "?", final }, params => {
      if (params.includes(25)) this.cursorVisible = final === "h";
      return false;
    });
  }
  get status(): TerminalStatus { return { ...this.statusValue }; }
  get applicationCursor(): boolean { return this.terminal.modes.applicationCursorKeysMode; }
  private setState(state: TerminalState, extra: Partial<TerminalStatus> = {}) {
    if (this.lifetime.signal.aborted) return;
    this.statusValue = { ...this.statusValue, ...extra, state };
    this.changed();
    for (const listener of this.listeners) listener();
  }
  start(): Promise<void> {
    if (this.lifetime.signal.aborted) return Promise.reject(new TerminalError("terminal_removed", "The terminal resource was removed."));
    if (this.starting) return this.starting;
    this.setState("starting");
    this.starting = (async () => {
      try {
        const shell = await resolveShell({ ...this.settings(), selected: this.config.profile });
        const integration = await prepareInteractiveShell(shell, this.root, this.token);
        this.integrationCleanup = integration.cleanup;
        this.lifetime.signal.throwIfAborted();
        this.statusValue.shell = shell.executable;
        this.exited = new Promise<void>(resolve => { this.resolveExit = resolve; });
        try {
          this.process = pty.spawn(shell.executable, integration.args, { name: "xterm-256color", cols: this.terminal.cols, rows: this.terminal.rows,
            cwd: this.config.cwd, env: integration.env as Record<string, string>, });
        } catch (error) { this.resolveExit?.(); throw error; }
        this.process.onData(data => {
          if (this.lifetime.signal.aborted) return;
          this.process!.pause();
          this.raw += data; this.rawEnd += data.length;
          if (this.raw.length > RAW_CHARACTERS) this.raw = this.raw.slice(-RAW_CHARACTERS);
          this.parsed = this.parsed.then(() => new Promise<void>(resolve => {
            if (this.lifetime.signal.aborted) { resolve(); return; }
            this.terminal.write(data, () => {
              if (!this.lifetime.signal.aborted) this.frame({ kind: "output", data, sequence: ++this.sequence });
              if (!this.lifetime.signal.aborted) this.process?.resume();
              resolve();
            });
          }));
        });
        this.process.onExit(({ exitCode }) => {
          this.resolveExit?.();
          void this.parsed.then(() => this.setState("exited", { exitCode }));
        });
        if (!integration.supported) { this.ready = true; this.setState("unknown"); }
      } catch (error) {
        if (!this.lifetime.signal.aborted) this.setState("failed", { error: String(error) });
        throw error;
      }
    })();
    return this.starting;
  }
  async input(data: string, signal: AbortSignal) {
    await this.start();
    signal.throwIfAborted(); this.lifetime.signal.throwIfAborted();
    if (["exited", "failed"].includes(this.statusValue.state)) throw new TerminalError("terminal_exited", "This shell has exited. Create another terminal resource.");
    // 提交输入后，旧提示符不再证明就绪；新的 shell 标记确认执行或返回提示符。
    if (/[\r\n]/u.test(data) && !this.ready) this.submittedBeforePrompt = true;
    if (this.statusValue.state === "idle" && /[\r\n\x03\x04]/u.test(data)) this.setState("unknown");
    this.process!.write(data);
  }
  async resize(cols: number, rows: number) {
    if (cols === this.terminal.cols && rows === this.terminal.rows) return;
    this.parsed = this.parsed.then(() => {
      if (this.lifetime.signal.aborted) return;
      this.terminal.resize(cols, rows);
      if (this.process && !["exited", "failed"].includes(this.statusValue.state)) this.process.resize(cols, rows);
      this.frame({ kind: "resize", cols, rows, sequence: ++this.sequence });
    });
    await this.parsed;
  }
  async snapshot() {
    await this.parsed;
    return { ...this.status, cols: this.terminal.cols, rows: this.terminal.rows, sequence: this.sequence, serialized: this.serializer.serialize() };
  }
  async read(mode: "screen" | "history" | "raw", offset?: number, limit?: number) {
    await this.parsed;
    const buffer = this.terminal.buffer.active;
    let text: string, start: number, end: number, truncated: boolean;
    if (mode === "raw") {
      const first = this.rawEnd - this.raw.length;
      const requested = offset ?? Math.max(first, this.rawEnd - (limit ?? 16384));
      start = Math.max(first, Math.min(requested, this.rawEnd)); end = Math.min(this.rawEnd, start + (limit ?? 16384));
      text = this.raw.slice(start - first, end - first); truncated = requested < first || end < this.rawEnd;
    } else {
      start = mode === "screen" ? buffer.baseY : Math.max(0, Math.min(offset ?? Math.max(0, buffer.length - (limit ?? 100)), buffer.length));
      end = Math.min(buffer.length, start + (mode === "screen" ? this.terminal.rows : Math.min(limit ?? 100, 2000)));
      text = Array.from({ length: end - start }, (_, row) => buffer.getLine(start + row)?.translateToString(mode !== "screen") ?? "").join("\n");
      truncated = mode === "history" && (start > 0 || end < buffer.length);
    }
    return { ...this.status, mode, text, cols: this.terminal.cols, rows: this.terminal.rows,
      cursor: { x: buffer.cursorX, y: buffer.cursorY }, offset: start, nextOffset: end, truncated };
  }
  async image(): Promise<TerminalImage> {
    await this.parsed;
    const buffer = this.terminal.buffer.active;
    return { cols: this.terminal.cols, rows: this.terminal.rows, cursor: { x: buffer.cursorX, y: buffer.cursorY, visible: this.cursorVisible },
      cells: Array.from({ length: this.terminal.rows }, (_, y) => Array.from({ length: this.terminal.cols }, (_, x) => {
        const cell = buffer.getLine(buffer.baseY + y)?.getCell(x);
        let fg = color(cell?.getFgColor() ?? -1, cell?.isFgRGB() ?? false, foreground);
        let bg = color(cell?.getBgColor() ?? -1, cell?.isBgRGB() ?? false, background);
        if (cell?.isInverse()) [fg, bg] = [bg, fg];
        return { text: cell?.isInvisible() ? "" : cell?.getChars() ?? "", width: cell?.getWidth() ?? 1, fg, bg,
          bold: !!cell?.isBold(), italic: !!cell?.isItalic(), underline: !!cell?.isUnderline(), strike: !!cell?.isStrikethrough() };
      })) };
  }
  async waitIdle(timeout: number, signal: AbortSignal) {
    const started = performance.now();
    const reason = await this.observe(() => {
      const state = this.statusValue.state;
      if (state === "idle") return "idle";
      if (["exited", "failed", "inactive"].includes(state)) return state;
      if (state === "unknown" && this.ready && !this.statusValue.integration) return "unsupported";
      return null;
    }, timeout * 1000, signal);
    return { reason, ...this.status, elapsedMs: Math.round(performance.now() - started) };
  }
  private observe(check: () => string | null, timeout: number, signal: AbortSignal): Promise<string> {
    const combined = AbortSignal.any([signal, this.lifetime.signal]);
    combined.throwIfAborted();
    const current = check();
    if (current) return Promise.resolve(current);
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.listeners.delete(update); combined.removeEventListener("abort", abort); };
      const update = () => { const value = check(); if (value) { cleanup(); resolve(value); } };
      const abort = () => { cleanup(); reject(combined.reason); };
      const timer = setTimeout(() => { cleanup(); resolve("timeout"); }, timeout);
      this.listeners.add(update); combined.addEventListener("abort", abort, { once: true });
    });
  }
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    this.lifetime.abort(new TerminalError("terminal_removed", "The terminal resource was removed."));
    this.disposing = (async () => {
      await this.starting?.catch(() => {});
      try {
        if (this.process && this.statusValue.state !== "exited") {
          this.process.resume();
          await terminateTerminal(this.process);
          await this.exited;
        }
        await this.parsed;
      } finally { this.terminal.dispose(); await this.integrationCleanup?.(); }
    })();
    return this.disposing;
  }
}

function color(value: number, rgb: boolean, fallback: string): string {
  if (value < 0) return fallback;
  if (rgb) return `#${value.toString(16).padStart(6, "0")}`;
  if (value < 16) return terminalPalette[value]!;
  if (value >= 232) { const gray = (8 + (value - 232) * 10).toString(16).padStart(2, "0"); return `#${gray}${gray}${gray}`; }
  const levels = [0, 95, 135, 175, 215, 255], index = value - 16;
  return `#${[Math.floor(index / 36), Math.floor(index / 6) % 6, index % 6].map(component => levels[component]!.toString(16).padStart(2, "0")).join("")}`;
}
export function keySequence(key: typeof keyNames[number], applicationCursor: boolean): string {
  const prefix = applicationCursor ? "\x1bO" : "\x1b[";
  const keys: Record<typeof keyNames[number], string> = {
    Enter: "\r", Tab: "\t", Escape: "\x1b", Backspace: "\x7f", Delete: "\x1b[3~", Up: `${prefix}A`, Down: `${prefix}B`, Right: `${prefix}C`, Left: `${prefix}D`,
    Home: `${prefix}H`, End: `${prefix}F`, PageUp: "\x1b[5~", PageDown: "\x1b[6~", "Ctrl+C": "\x03", "Ctrl+D": "\x04", "Ctrl+Z": "\x1a", "Ctrl+L": "\x0c", "Ctrl+A": "\x01", "Ctrl+E": "\x05", "Ctrl+U": "\x15", "Ctrl+K": "\x0b",
  };
  return keys[key];
}

/** PTY 子任务可有独立前台进程组；按实际后代清理，不把根 PID 当作整棵树。 */
async function terminateTerminal(terminal: pty.IPty) {
  if (process.platform === "win32") {
    try { await execute("taskkill", ["/PID", String(terminal.pid), "/T", "/F"]); }
    catch (error) { try { process.kill(terminal.pid, 0); } catch { return; } throw error; }
    return;
  }
  const { stdout } = await execute("ps", ["-axo", "pid=,ppid="]);
  const children = new Map<number, number[]>();
  for (const line of stdout.trim().split("\n")) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number);
    if (pid && parent) children.set(parent, [...children.get(parent) ?? [], pid]);
  }
  const descendants = (pid: number): number[] => (children.get(pid) ?? []).flatMap(child => [...descendants(child), child]);
  for (const pid of descendants(terminal.pid)) {
    try { process.kill(pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  }
  try { terminal.kill("SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}
