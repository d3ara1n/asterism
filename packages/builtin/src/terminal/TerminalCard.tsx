import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useI18n, useRendererCalls, useRendererObject } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { Play, Square } from "lucide-react";
import { terminalMessages } from "../messages/terminal";
import { ReadTerminal, WriteTerminal, ResizeTerminal, StartTerminal, type TerminalFrame, type TerminalStatus, type TerminalConfig } from "./contract";

/** 浏览器副本保留输入能力；终端协议查询由后台的唯一解析器应答。 */
function passiveProtocol(terminal: Terminal) {
  for (const final of ["c", "n", "t"]) for (const prefix of ["", "?", ">", "="])
    terminal.parser.registerCsiHandler({ final, ...(prefix ? { prefix } : {}) }, () => true);
  for (const prefix of ["", "?"]) terminal.parser.registerCsiHandler({ final: "p", intermediates: "$", ...(prefix ? { prefix } : {}) }, () => true);
  terminal.parser.registerDcsHandler({ final: "q", intermediates: "$" }, () => true);
  for (const code of [4, 10, 11, 12]) terminal.parser.registerOscHandler(code, data => data.includes("?"));
}

export function TerminalCard({ data }: { data: TerminalStatus & TerminalConfig }) {
  const object = useRendererObject(), calls = useRendererCalls(), i18n = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [error, setError] = useState<string | null>(null), [starting, setStarting] = useState(false);
  const { sessionId, id, kind } = object.ref;
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const controller = new AbortController(), signal = controller.signal;
    const terminal = new Terminal({ cols: 100, rows: 28, scrollback: 5000, allowProposedApi: true,
      fontFamily: 'Menlo, Consolas, "Liberation Mono", monospace', fontSize: 14, cursorBlink: true,
      theme: { background: "#1e1e1e", foreground: "#d4d4d4", cursor: "#d4d4d4" } });
    const fit = new FitAddon(); terminal.loadAddon(fit); passiveProtocol(terminal);
    terminalRef.current = terminal;
    const ref = { sessionId, id, kind };
    let initialized = false, sequence = 0, scheduled = 0;
    let input = Promise.resolve(), rendering = Promise.resolve();
    const queued: TerminalFrame[] = [];
    const report = (failure: unknown) => { if (!signal.aborted) setError(String(failure)); };
    const apply = (frame: TerminalFrame) => {
      if (frame.sequence <= sequence) return;
      sequence = frame.sequence;
      // 输出解析是异步的；尺寸帧也按相同流次序处理。
      rendering = rendering.then(() => new Promise<void>(resolve => {
        if (signal.aborted) { resolve(); return; }
        if (frame.kind === "output") terminal.write(frame.data, resolve);
        else { terminal.resize(frame.cols, frame.rows); resolve(); }
      }));
    };
    const unsubscribe = object.onStream("terminal", bytes => {
      const frame = JSON.parse(new TextDecoder().decode(bytes)) as TerminalFrame;
      if (!initialized) queued.push(frame); else apply(frame);
    });
    terminal.onData(text => {
      input = input.then(async () => { signal.throwIfAborted(); await calls.invoke(WriteTerminal, { data: text }, { object: ref, signal }); }).catch(report);
    });
    terminal.attachCustomKeyEventHandler(event => {
      if (event.type === "keydown" && (event.metaKey || (event.ctrlKey && event.shiftKey)) && event.key.toLowerCase() === "c" && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection()).catch(report); return false;
      }
      return true;
    });
    const resize = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(() => {
        if (!initialized || !host.clientWidth || !host.clientHeight) return;
        const size = fit.proposeDimensions();
        if (size) void calls.invoke(ResizeTerminal, { cols: Math.max(2, Math.min(500, size.cols)), rows: Math.max(1, Math.min(200, size.rows)) }, { object: ref, signal }).catch(report);
      });
    };
    const observer = new ResizeObserver(resize); observer.observe(host);
    void calls.invoke(ReadTerminal, {}, { object: ref, signal }).then(snapshot => {
      if (signal.aborted) return;
      terminal.resize(snapshot.cols, snapshot.rows);
      terminal.write(snapshot.serialized, () => {
        if (signal.aborted) return;
        sequence = snapshot.sequence;
        terminal.open(host); initialized = true;
        for (const frame of queued) apply(frame);
        queued.length = 0; resize();
      });
    }).catch(report);
    return () => { controller.abort(); unsubscribe(); observer.disconnect(); cancelAnimationFrame(scheduled); terminal.dispose(); terminalRef.current = null; };
  }, [sessionId, id, kind, calls]);
  const start = async () => {
    setStarting(true); setError(null);
    try { await calls.invoke(StartTerminal, {}, { object: object.ref }); terminalRef.current?.focus(); }
    catch (failure) { setError(String(failure)); }
    finally { setStarting(false); }
  };
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex min-h-8 shrink-0 items-center gap-2 border-b px-3 py-1">
      <span className={`size-1.5 shrink-0 rounded-full ${data.state === "running" ? "animate-pulse bg-primary" : data.state === "idle" ? "bg-success" : "bg-muted-foreground"}`} />
      <span className="type-caption shrink-0">{i18n.formatMessage(terminalMessages.state, { state: data.state })}</span>
      <span className="type-caption min-w-0 flex-1 truncate font-mono" title={data.cwd}>{data.cwd}</span>
      <Button size="icon-xs" variant="ghost" title={i18n.formatMessage(terminalMessages.interrupt)} disabled={["inactive", "exited", "failed"].includes(data.state)}
        onClick={() => { void calls.invoke(WriteTerminal, { data: "\x03" }, { object: object.ref }).catch(failure => setError(String(failure))); }}><Square className="size-3" /></Button>
    </div>
    <div className="nodrag nopan nowheel relative min-h-0 flex-1 bg-[#1e1e1e] p-2" onKeyDown={event => event.stopPropagation()}>
      <div ref={container} className="h-full w-full" />
      {data.state === "inactive" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1e1e1e] p-6 text-[#d4d4d4]">
        <p className="text-center text-xs">{i18n.formatMessage(terminalMessages.inactive)}</p>
        <Button variant="secondary" size="sm" disabled={starting || !object.view.ready} onClick={() => { void start(); }}><Play />{i18n.formatMessage(terminalMessages.start)}</Button>
      </div>}
    </div>
    {data.state === "exited" && <p className="type-caption shrink-0 px-3 py-2">{i18n.formatMessage(terminalMessages.exited, { code: data.exitCode ?? "?" })}</p>}
    {data.state === "unknown" && !data.integration && <p className="type-caption shrink-0 px-3 py-2">{i18n.formatMessage(terminalMessages.noIntegration)}</p>}
    {(error || data.error) && <p className="type-caption shrink-0 break-words px-3 py-2 text-destructive">{i18n.formatMessage(terminalMessages.failed, { error: error ?? data.error! })}</p>}
  </div>;
}
