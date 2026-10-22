import * as pty from "node-pty";
import headless from "@xterm/headless";
import serialize from "@xterm/addon-serialize";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ShellSettings } from "../shell/contract.ts";
import { resolveShell } from "../shell/profiles.ts";
import { prepareLaunch, type IntegrationMode } from "./integration.ts";
import { inactiveStatus, type TerminalConfig, type TerminalDown, type TerminalImage, type TerminalState, type TerminalStatus, type TerminalUp, type keyNames } from "./contract.ts";

const { Terminal } = headless;
const { SerializeAddon } = serialize;
const execute = promisify(execFile);
const SCROLLBACK_LINES = 5000;
const RAW_CHARACTERS = 1024 * 1024;
/** 输出合批：短时间内的 PTY 块合成一帧；单帧超过上限立即交付。 */
const BATCH_MS = 5, BATCH_CHARACTERS = 64 * 1024;
/** 流控水位：未解析与未确认字符超过高水位暂停 PTY，降到低水位恢复。 */
const HIGH_WATERMARK = 100_000, LOW_WATERMARK = 5_000;
/** 注入集成等待首个标记的上限；超时降级为无状态检测。 */
const HANDSHAKE_MS = 10_000, NATIVE_HANDSHAKE_MS = 3_000;
/** 结束实例：SIGHUP 后的宽限期与强制结束后的等待上限。 */
const HANGUP_GRACE_MS = 2_000, KILL_WAIT_MS = 2_000;
const DEFAULT_COLS = 100, DEFAULT_ROWS = 28;
const terminalPalette = ["#1e1e1e", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5", "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"];
const foreground = "#d4d4d4", background = "#1e1e1e";

export class TerminalError extends Error { constructor(readonly code: string, message: string) { super(message); } }

/** 原始输出的有界保留：按块存储，超出预算时丢弃最旧的整块，不逐块复制全量字符串。 */
class RawBuffer {
  private chunks: string[] = [];
  private size = 0;
  private start = 0;
  get end() { return this.start + this.size; }
  get first() { return this.start; }
  push(data: string) {
    this.chunks.push(data); this.size += data.length;
    while (this.chunks.length > 1 && this.size - this.chunks[0]!.length >= RAW_CHARACTERS) {
      const dropped = this.chunks.shift()!;
      this.size -= dropped.length; this.start += dropped.length;
    }
  }
  slice(from: number, to: number): string {
    const parts: string[] = [];
    let offset = this.start;
    for (const chunk of this.chunks) {
      const next = offset + chunk.length;
      if (next > from && offset < to) parts.push(chunk.slice(Math.max(0, from - offset), Math.min(chunk.length, to - offset)));
      offset = next;
      if (offset >= to) break;
    }
    let text = parts.join("");
    // 不从代理对中间切开。
    if (/^[\uDC00-\uDFFF]/u.test(text)) text = text.slice(1);
    if (/[\uD800-\uDBFF]$/u.test(text)) text = text.slice(0, -1);
    return text;
  }
}

interface InstanceHooks {
  output(data: string): void;
  resize(cols: number, rows: number): void;
  changed(status: TerminalStatus): void;
}

/** 一个 shell 进程及其后台屏幕；退出后保留最后屏幕供读取，直到被替换或关闭。 */
export class ShellInstance {
  private readonly terminal: InstanceType<typeof Terminal>;
  private readonly serializer = new SerializeAddon();
  private process?: pty.IPty;
  private alive = false;
  private paused = false;
  private readonly nonce = randomUUID();
  private mode: IntegrationMode = "none";
  private ready = false;
  private submittedBeforePrompt = false;
  private watchdog?: ReturnType<typeof setTimeout>;
  private chain = Promise.resolve();
  private pending = "";
  private batch?: ReturnType<typeof setTimeout>;
  private parsing = 0;
  private backlog = 0;
  private readonly raw = new RawBuffer();
  private cursorVisible = true;
  private readonly waiters = new Set<() => void>();
  private readonly lifetime = new AbortController();
  private disposing?: Promise<void>;
  private exited = Promise.resolve();
  private statusValue: TerminalStatus = { ...inactiveStatus, state: "starting" };

  constructor(private readonly config: TerminalConfig, private readonly settings: () => ShellSettings, private readonly root: string,
    private readonly hooks: InstanceHooks, size: { cols: number; rows: number }) {
    this.terminal = new Terminal({ cols: size.cols, rows: size.rows, scrollback: SCROLLBACK_LINES, allowProposedApi: true });
    this.terminal.loadAddon(this.serializer);
    this.terminal.parser.registerOscHandler(133, data => this.promptMark(data));
    this.terminal.parser.registerOscHandler(633, data => this.property(data));
    this.terminal.parser.registerOscHandler(7, data => this.location(data));
    // 后台是终端协议自动回复的唯一发送者；前端副本只转发用户输入。
    this.terminal.onData(data => { if (this.alive) this.process!.write(data); });
    for (const final of ["h", "l"]) this.terminal.parser.registerCsiHandler({ prefix: "?", final }, params => {
      if (params.includes(25)) this.cursorVisible = final === "h";
      return false;
    });
  }
  get status(): TerminalStatus { return { ...this.statusValue }; }
  get running(): boolean { return this.alive; }
  get applicationCursor(): boolean { return this.terminal.modes.applicationCursorKeysMode; }
  get size() { return { cols: this.terminal.cols, rows: this.terminal.rows }; }

  private setState(state: TerminalState, extra: Partial<TerminalStatus> = {}) {
    if (this.lifetime.signal.aborted) return;
    const next = { ...this.statusValue, ...extra, state };
    if (Object.entries(next).every(([key, value]) => this.statusValue[key as keyof TerminalStatus] === value)) return;
    this.statusValue = next;
    this.hooks.changed(this.status);
    for (const waiter of [...this.waiters]) waiter();
  }
  /** 注入集成要求 nonce；原生集成接受无 nonce 的标准标记。 */
  private trusted(params: string[]): string[] | null {
    if (this.mode === "none") return null;
    if (this.mode === "injected") return params.at(-1) === this.nonce ? params.slice(0, -1) : null;
    return params;
  }
  private confirm() {
    if (this.statusValue.integration) return;
    clearTimeout(this.watchdog);
    this.statusValue = { ...this.statusValue, integration: true };
  }
  private promptMark(data: string): boolean {
    const [kind, ...rest] = data.split(";");
    const params = this.trusted(rest);
    if (!params) return true;
    this.confirm();
    if (kind === "A") {
      const initial = !this.ready;
      this.ready = true;
      // 首个提示符之前已提交的输入仍在 shell 队列中，提示符不能证明就绪。
      if (initial && this.submittedBeforePrompt) this.setState("unknown");
      else this.setState("idle");
    } else if (kind === "C") this.setState("running");
    else if (kind === "D") {
      const code = Number(params[0]);
      this.statusValue = { ...this.statusValue, lastExitCode: Number.isFinite(code) && params[0] !== "" ? code : null };
    }
    return true;
  }
  private property(data: string): boolean {
    const [kind, ...rest] = data.split(";");
    if (kind !== "P" || this.mode !== "injected" || rest[0] !== this.nonce) return true;
    const value = rest.slice(1).join(";");
    if (value.startsWith("Cwd=")) this.setState(this.statusValue.state, { cwd: value.slice(4) });
    return true;
  }
  private location(data: string): boolean {
    if (this.mode !== "native") return true;
    try { const url = new URL(data); if (url.protocol === "file:") this.setState(this.statusValue.state, { cwd: decodeURIComponent(url.pathname) }); }
    catch { /* 非法 OSC 7 忽略。 */ }
    return true;
  }

  async start(): Promise<void> {
    try {
      const shell = await resolveShell({ ...this.settings(), selected: this.config.profile });
      const launch = await prepareLaunch(shell, this.root, this.nonce);
      this.lifetime.signal.throwIfAborted();
      this.mode = launch.mode;
      let resolveExit!: () => void;
      this.exited = new Promise<void>(resolve => { resolveExit = resolve; });
      try {
        this.process = pty.spawn(shell.executable, launch.args, { name: "xterm-256color", cols: this.terminal.cols, rows: this.terminal.rows,
          cwd: this.config.cwd, env: launch.env });
      } catch (error) { resolveExit(); throw error; }
      this.alive = true;
      this.statusValue = { ...this.statusValue, shell: shell.executable };
      this.process.onData(data => this.receive(data));
      this.process.onExit(({ exitCode }) => {
        this.alive = false;
        clearTimeout(this.watchdog);
        this.flush();
        void this.chain.then(() => { this.setState("exited", { exitCode }); resolveExit(); });
      });
      if (launch.mode === "none") { this.ready = true; this.setState("unknown"); return; }
      this.watchdog = setTimeout(() => {
        if (this.statusValue.integration || !this.alive) return;
        // 集成未加载（rc 报错、exec 替换 shell 等）：降级为无状态检测。
        this.ready = true;
        this.setState("unknown", { integration: false });
      }, launch.mode === "injected" ? HANDSHAKE_MS : NATIVE_HANDSHAKE_MS);
    } catch (error) {
      if (!this.lifetime.signal.aborted) this.setState("failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  private receive(data: string) {
    this.raw.push(data);
    this.pending += data;
    if (this.pending.length >= BATCH_CHARACTERS) this.flush();
    else this.batch ??= setTimeout(() => this.flush(), BATCH_MS);
  }
  private flush() {
    clearTimeout(this.batch); this.batch = undefined;
    if (!this.pending) return;
    const data = this.pending;
    this.pending = "";
    this.parsing += data.length;
    this.regulate();
    this.chain = this.chain.then(() => new Promise<void>(resolve => {
      this.terminal.write(data, () => {
        this.parsing -= data.length;
        if (!this.lifetime.signal.aborted) this.hooks.output(data);
        this.regulate();
        resolve();
      });
    }));
  }
  /** 后台解析积压与前端未确认字符共同决定是否暂停 PTY。 */
  setBacklog(chars: number) { this.backlog = chars; this.regulate(); }
  private regulate() {
    if (!this.alive) return;
    const total = this.parsing + this.backlog;
    if (!this.paused && total > HIGH_WATERMARK) { this.paused = true; this.process!.pause(); }
    else if (this.paused && total < LOW_WATERMARK) { this.paused = false; this.process!.resume(); }
  }

  write(data: string | Buffer) {
    if (!this.alive) throw new TerminalError("terminal_exited", "The shell has exited.");
    const text = typeof data === "string" ? data : "";
    if (/[\r\n]/u.test(text)) {
      if (!this.ready) this.submittedBeforePrompt = true;
      // 提交后旧提示符不再证明就绪；新的 shell 标记确认执行或返回提示符。
      if (this.statusValue.state === "idle") this.setState("unknown");
    }
    this.process!.write(data);
  }
  resize(cols: number, rows: number) {
    if (cols === this.terminal.cols && rows === this.terminal.rows) return;
    this.enqueue(() => {
      this.terminal.resize(cols, rows);
      if (this.alive) this.process!.resize(cols, rows);
      this.hooks.resize(cols, rows);
    });
  }
  /** 在输出解析链上执行：之前的输出已进入屏幕，之后的输出尚未进入。 */
  enqueue<T>(work: () => T): Promise<T> {
    this.flush();
    const result = this.chain.then(work);
    this.chain = result.then(() => {}, () => {});
    return result;
  }
  snapshot() {
    return { cols: this.terminal.cols, rows: this.terminal.rows, data: this.serializer.serialize() };
  }

  read(mode: "screen" | "history" | "raw", offset?: number, limit?: number) {
    return this.enqueue(() => {
      const buffer = this.terminal.buffer.active;
      let text: string, start: number, end: number, truncated: boolean;
      if (mode === "raw") {
        const first = this.raw.first, last = this.raw.end;
        const requested = offset ?? Math.max(first, last - (limit ?? 16384));
        start = Math.max(first, Math.min(requested, last)); end = Math.min(last, start + (limit ?? 16384));
        text = this.raw.slice(start, end); truncated = requested < first || end < last;
      } else {
        start = mode === "screen" ? buffer.baseY : Math.max(0, Math.min(offset ?? Math.max(0, buffer.length - (limit ?? 100)), buffer.length));
        end = Math.min(buffer.length, start + (mode === "screen" ? this.terminal.rows : Math.min(limit ?? 100, 2000)));
        text = Array.from({ length: end - start }, (_, row) => buffer.getLine(start + row)?.translateToString(mode !== "screen") ?? "").join("\n");
        truncated = mode === "history" && (start > 0 || end < buffer.length);
      }
      return { ...this.status, mode, text, cols: this.terminal.cols, rows: this.terminal.rows,
        cursor: { x: buffer.cursorX, y: buffer.cursorY }, offset: start, nextOffset: end, truncated };
    });
  }
  image(): Promise<TerminalImage> {
    return this.enqueue(() => {
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
      return { cols: this.terminal.cols, rows: this.terminal.rows, cursor: { x: buffer.cursorX, y: buffer.cursorY, visible: this.cursorVisible }, cells };
    });
  }
  waitIdle(timeout: number, signal: AbortSignal): Promise<string> {
    const check = () => {
      const state = this.statusValue.state;
      if (state === "idle") return "idle";
      if (state === "exited" || state === "failed") return state;
      if (state === "unknown" && this.ready && !this.statusValue.integration) return "unsupported";
      return null;
    };
    const combined = AbortSignal.any([signal, this.lifetime.signal]);
    combined.throwIfAborted();
    const current = check();
    if (current) return Promise.resolve(current);
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.waiters.delete(update); combined.removeEventListener("abort", abort); };
      const update = () => { const value = check(); if (value) { cleanup(); resolve(value); } };
      const abort = () => { cleanup(); reject(combined.reason); };
      const timer = setTimeout(() => { cleanup(); resolve("timeout"); }, timeout * 1000);
      this.waiters.add(update); combined.addEventListener("abort", abort, { once: true });
    });
  }
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    this.lifetime.abort(new TerminalError("terminal_closed", "The terminal was closed."));
    clearTimeout(this.watchdog); clearTimeout(this.batch);
    this.disposing = (async () => {
      try {
        if (this.alive && this.process) {
          if (this.paused) { this.paused = false; this.process.resume(); }
          await terminate(this.process, this.exited);
        }
        await this.chain;
      } finally { this.terminal.dispose(); }
    })();
    return this.disposing;
  }
}

function color(value: number, rgb: boolean, isDefault: boolean, fallback: string): string {
  if (isDefault || value < 0) return fallback;
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

const within = (promise: Promise<void>, ms: number) => Promise.race([promise.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), ms))]);
/**
 * 先挂断让 shell 与前台程序按自身语义退出（写历史、清理临时文件），宽限期后强制结束残留后代。
 * 后代在挂断前按进程表快照：shell 退出后它们会被重新挂到 init 上，无法再按父进程追溯。
 */
async function terminate(process: pty.IPty, exited: Promise<void>) {
  if (globalThis.process.platform === "win32") {
    try { process.kill(); } catch { /* 已退出。 */ }
    if (await within(exited, HANGUP_GRACE_MS)) return;
    try { await execute("taskkill", ["/PID", String(process.pid), "/T", "/F"]); } catch { /* 进程可能已退出。 */ }
    if (!await within(exited, KILL_WAIT_MS)) throw new Error("The shell process did not exit.");
    return;
  }
  const descendants = await descendantsOf(process.pid).catch(() => []);
  try { process.kill("SIGHUP"); } catch { /* 已退出。 */ }
  const clean = await within(exited, HANGUP_GRACE_MS);
  for (const pid of descendants) {
    try { globalThis.process.kill(pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  }
  if (clean) return;
  try { process.kill("SIGKILL"); } catch { /* 已退出。 */ }
  if (!await within(exited, KILL_WAIT_MS)) throw new Error("The shell process did not exit.");
}
async function descendantsOf(root: number): Promise<number[]> {
  const { stdout } = await execute("ps", ["-axo", "pid=,ppid="]);
  const children = new Map<number, number[]>();
  for (const line of stdout.trim().split("\n")) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number);
    if (pid && parent) children.set(parent, [...children.get(parent) ?? [], pid]);
  }
  const walk = (pid: number): number[] => (children.get(pid) ?? []).flatMap(child => [...walk(child), child]);
  return walk(root);
}

export interface TerminalViewer { send(frame: TerminalDown): void }
interface ViewerState { viewer: TerminalViewer; live: boolean; unacked: number }

/**
 * 终端资源对应的外部实例：资源对象只是入口，实例在开启时创建、关闭或资源消失时结束。
 * 所有视图共享同一实例；每个视图先收到屏幕快照，再接续之后的输出。
 */
export class SharedTerminal {
  private instance: ShellInstance | null = null;
  private launching: Promise<void> | null = null;
  private readonly viewers = new Set<ViewerState>();
  private size = { cols: DEFAULT_COLS, rows: DEFAULT_ROWS };
  private closed = false;
  constructor(private readonly config: TerminalConfig, private readonly settings: () => ShellSettings, private readonly root: string,
    private readonly events: { changed(status: TerminalStatus): void; failed(error: unknown): void; log(message: string, error: unknown): void }) {}
  get status(): TerminalStatus { return this.instance?.status ?? { ...inactiveStatus }; }
  get started(): boolean { return this.instance !== null; }

  /** 开启 shell；运行中为空操作，已退出或失败时以新实例替换。 */
  start(): Promise<void> {
    if (this.closed) return Promise.reject(new TerminalError("terminal_removed", "The terminal resource was removed."));
    if (this.launching) return this.launching;
    if (this.instance && this.instance.running) return Promise.resolve();
    const previous = this.instance;
    if (previous) void previous.dispose().catch(error => this.events.log("Terminal cleanup failed.", error));
    const instance: ShellInstance = this.instance = new ShellInstance(this.config, this.settings, this.root, this.hooks(() => instance), this.size);
    this.replay();
    const launching = this.launching = instance.start().catch((error: unknown) => {
      if (this.instance === instance) this.events.failed(error);
      throw error;
    }).finally(() => { if (this.launching === launching) this.launching = null; });
    this.events.changed(instance.status);
    return launching;
  }
  private hooks(current: () => ShellInstance): InstanceHooks {
    return {
      output: data => {
        if (this.instance !== current()) return;
        for (const state of this.viewers) if (state.live) { state.unacked += data.length; this.send(state, { type: "output", data }); }
        this.updateBacklog();
      },
      resize: (cols, rows) => {
        if (this.instance !== current()) return;
        this.size = { cols, rows };
        for (const state of this.viewers) if (state.live) this.send(state, { type: "resize", cols, rows });
      },
      changed: status => {
        if (this.instance !== current()) return;
        for (const state of this.viewers) if (state.live) this.send(state, { type: "status", status });
        this.events.changed(status);
      },
    };
  }
  private send(state: ViewerState, frame: TerminalDown) {
    try { state.viewer.send(frame); } catch { this.viewers.delete(state); this.updateBacklog(); }
  }
  private updateBacklog() {
    this.instance?.setBacklog(Math.max(0, ...[...this.viewers].map(state => state.unacked)));
  }
  /** 视图重新同步：快照在输出解析链上取得，之后的输出顺次交付，不重不漏。 */
  private replay(states: Iterable<ViewerState> = this.viewers) {
    const instance = this.instance;
    for (const state of states) {
      state.live = false; state.unacked = 0;
      if (!instance) {
        this.send(state, { type: "reset", ...this.size, data: "" });
        this.send(state, { type: "status", status: { ...inactiveStatus } });
        state.live = true;
        continue;
      }
      void instance.enqueue(() => {
        if (this.instance !== instance || !this.viewers.has(state)) return;
        this.send(state, { type: "reset", ...instance.snapshot() });
        this.send(state, { type: "status", status: instance.status });
        state.live = true;
      });
    }
    this.updateBacklog();
  }
  /** 结束当前实例并回到未开启；资源对象保留，可再次开启。 */
  async close(): Promise<void> {
    const instance = this.instance;
    this.instance = null; this.launching = null;
    this.replay();
    this.events.changed(this.status);
    await instance?.dispose();
  }
  dispose(): Promise<void> {
    this.closed = true;
    this.viewers.clear();
    const instance = this.instance;
    this.instance = null;
    return instance?.dispose() ?? Promise.resolve();
  }

  attach(viewer: TerminalViewer): (message: TerminalUp) => void {
    const state: ViewerState = { viewer, live: false, unacked: 0 };
    this.viewers.add(state);
    this.replay([state]);
    return message => this.receive(state, message);
  }
  detach(viewer: TerminalViewer) {
    for (const state of this.viewers) if (state.viewer === viewer) this.viewers.delete(state);
    this.updateBacklog();
  }
  private receive(state: ViewerState, message: TerminalUp) {
    if (!this.viewers.has(state)) return;
    const instance = this.instance;
    switch (message.type) {
      case "input":
        if (instance?.running && typeof message.data === "string") instance.write(message.data);
        return;
      case "binary":
        if (instance?.running && typeof message.data === "string") instance.write(Buffer.from(message.data, "latin1"));
        return;
      case "resize": {
        const cols = Math.max(2, Math.min(500, Math.floor(Number(message.cols)) || 0));
        const rows = Math.max(1, Math.min(200, Math.floor(Number(message.rows)) || 0));
        if (instance) instance.resize(cols, rows);
        else this.size = { cols, rows };
        return;
      }
      case "ack":
        state.unacked = Math.max(0, state.unacked - (Number(message.chars) || 0));
        this.updateBacklog();
        return;
      case "refresh": this.replay([state]);
    }
  }

  /** 模型输入：未开启时开启；已退出或失败的 shell 由用户在卡片中重新开启。 */
  async input(data: string, signal: AbortSignal): Promise<TerminalStatus> {
    if (!this.instance) {
      try { await this.start(); }
      catch (error) { throw new TerminalError("terminal_failed", `The shell could not be started: ${error instanceof Error ? error.message : String(error)}`); }
    } else if (this.launching) await this.launching.catch(() => {});
    signal.throwIfAborted();
    const instance = this.instance;
    if (!instance) throw new TerminalError("terminal_closed", "The terminal was closed.");
    if (!instance.running) throw new TerminalError("terminal_exited", "The shell has exited. The user can restart it from the terminal card.");
    instance.write(data);
    return instance.status;
  }
  get applicationCursor(): boolean { return this.instance?.applicationCursor ?? false; }
  private require(): ShellInstance {
    if (!this.instance) throw new TerminalError("terminal_inactive", "The terminal has not been started.");
    return this.instance;
  }
  read(mode: "screen" | "history" | "raw", offset?: number, limit?: number) { return this.require().read(mode, offset, limit); }
  image() { return this.require().image(); }
  async waitIdle(timeout: number, signal: AbortSignal) {
    const started = performance.now();
    const reason = this.instance ? await this.instance.waitIdle(timeout, signal) : "inactive";
    return { reason, ...this.status, elapsedMs: Math.round(performance.now() - started) };
  }
}
