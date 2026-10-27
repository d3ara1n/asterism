import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { useI18n, useRendererCalls, useRendererObject } from "@asterism/sdk/renderer";
import { Button } from "@asterism/ui/ui/button";
import { IconButton } from "@asterism/ui/ui/icon-button";
import { StatusBadge, type StatusTone } from "@asterism/ui/ui/status";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@asterism/ui/ui/alert-dialog";
import { Play, Power, RotateCcw } from "lucide-react";
import { commonMessages } from "@asterism/ui/messages/common";
import { terminalMessages } from "../messages/terminal";
import { CloseTerminal, StartTerminal, type TerminalConfig, type TerminalState } from "./contract";
import { useTerminalLink } from "./link";
import { ScreenWriter } from "./screen-writer";
import { terminalTypography } from "./typography";

/** The browser copy retains input capability; the backend's sole parser answers terminal-protocol queries. */
function passiveProtocol(terminal: Terminal) {
  for (const final of ["c", "n", "t"]) for (const prefix of ["", "?", ">", "="])
    terminal.parser.registerCsiHandler({ final, ...(prefix ? { prefix } : {}) }, () => true);
  for (const prefix of ["", "?"]) terminal.parser.registerCsiHandler({ final: "p", intermediates: "$", ...(prefix ? { prefix } : {}) }, () => true);
  terminal.parser.registerDcsHandler({ final: "q", intermediates: "$" }, () => true);
  for (const code of [4, 10, 11, 12]) terminal.parser.registerOscHandler(code, data => data.includes("?"));
}
const tones: Record<TerminalState, StatusTone> = { inactive: "neutral", starting: "progress", idle: "success", running: "progress", unknown: "neutral", exited: "neutral", failed: "error" };


/** Card header: instance status and close action. Closing ends the shell while retaining the resource object for reopening. */
export function TerminalActions({ data }: { data: TerminalConfig }) {
  const object = useRendererObject(), calls = useRendererCalls(), i18n = useI18n();
  const { status } = useTerminalLink(object);
  const [confirming, setConfirming] = useState(false), [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    void calls.invoke(CloseTerminal, {}, { object: object.ref }).catch(error => console.error("Terminal close failed.", error))
      .finally(() => { setClosing(false); setConfirming(false); });
  };
  const warn = status.state === "running" || status.state === "unknown" || status.state === "starting";
  return <>
    <StatusBadge tone={tones[status.state]} role="status" title={status.cwd ?? data.cwd}>{i18n.formatMessage(terminalMessages.state, { state: status.state })}</StatusBadge>
    {status.state !== "inactive" && <IconButton size="icon-xs" label={i18n.formatMessage(terminalMessages.close)} disabled={closing}
      onClick={() => { if (warn) setConfirming(true); else close(); }}><Power /></IconButton>}
    <AlertDialog open={confirming} onOpenChange={open => { if (!open && !closing) setConfirming(false); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{i18n.formatMessage(terminalMessages.closeTitle)}</AlertDialogTitle>
        <AlertDialogDescription>{i18n.formatMessage(status.state === "running" ? terminalMessages.runningWarning : terminalMessages.unknownWarning)}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={closing}>{i18n.formatMessage(commonMessages.cancel)}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={closing} onClick={event => { event.preventDefault(); close(); }}>{i18n.formatMessage(terminalMessages.close)}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}

/** Card body: terminal screen and open/reopen entry point; configuration and status appear in the header. */
export function TerminalCard() {
  const object = useRendererObject(), calls = useRendererCalls(), i18n = useI18n();
  const { link, status, end } = useTerminalLink(object);
  const container = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [error, setError] = useState<string | null>(null), [starting, setStarting] = useState(false);
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const terminal = new Terminal({ cols: 100, rows: 28, scrollback: 5000, allowProposedApi: true,
      ...terminalTypography(), cursorBlink: true,
      theme: { background: "#1e1e1e", foreground: "#d4d4d4", cursor: "#d4d4d4" } });
    const fit = new FitAddon();
    terminal.loadAddon(fit); passiveProtocol(terminal);
    terminal.open(host);
    // Browsers limit WebGL contexts; fall back to DOM rendering if context creation fails or the context is lost.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch (failure) { console.warn("Terminal WebGL rendering is unavailable; using DOM rendering.", failure); }
    terminalRef.current = terminal;
    const screen = new ScreenWriter(terminal);
    const detach = link.attach(screen);
    const input = terminal.onData(text => link.send({ type: "input", data: text }));
    const binary = terminal.onBinary(text => link.send({ type: "binary", data: text }));
    terminal.attachCustomKeyEventHandler(event => {
      if (event.type === "keydown" && (event.metaKey || (event.ctrlKey && event.shiftKey)) && event.key.toLowerCase() === "c" && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection()).catch(failure => setError(String(failure))); return false;
      }
      return true;
    });
    let scheduled = 0;
    // Dimensions reported by the backend are authoritative; local dimensions are only suggestions.
    const fitScreen = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(() => {
        if (!host.clientWidth || !host.clientHeight) return;
        const size = fit.proposeDimensions();
        if (size && (size.cols !== terminal.cols || size.rows !== terminal.rows)) link.send({ type: "resize", cols: size.cols, rows: size.rows });
      });
    };
    const observer = new ResizeObserver(fitScreen);
    const typographyObserver = new MutationObserver(() => {
      const { fontFamily, fontSize } = terminalTypography();
      if (terminal.options.fontFamily === fontFamily && terminal.options.fontSize === fontSize) return;
      terminal.options.fontFamily = fontFamily;
      terminal.options.fontSize = fontSize;
      fitScreen();
    });
    typographyObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    observer.observe(host);
    return () => {
      observer.disconnect(); typographyObserver.disconnect(); cancelAnimationFrame(scheduled);
      input.dispose(); binary.dispose(); detach(); screen.dispose();
      terminal.dispose(); terminalRef.current = null;
    };
  }, [link]);
  const start = async () => {
    setStarting(true); setError(null);
    try { await calls.invoke(StartTerminal, {}, { object: object.ref }); terminalRef.current?.focus(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setStarting(false); }
  };
  const stopped = status.state === "exited" || status.state === "failed";
  const message = end ? end.message ?? end.reason : error ?? status.error;
  // The terminal screen stays dark (ANSI colors are designed for a dark background); the bottom hint bar joins the same dark screen rather than separating from the card content surface.
  return <div className="flex min-h-0 flex-1 flex-col bg-[#1e1e1e] text-[#d4d4d4]">
    <div className="nodrag nopan relative min-h-0 flex-1 p-2" onKeyDown={event => event.stopPropagation()}>
      {/* Internal xterm layers have z-index values; isolate them in a stacking context so overlays appear above them in document order. */}
      <div ref={container} className="isolate h-full w-full" />
      {status.state === "inactive" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1e1e1e] p-6 text-[#d4d4d4]">
        <p className="text-center text-xs">{i18n.formatMessage(terminalMessages.inactive)}</p>
        <Button variant="secondary" size="sm" disabled={starting || !object.view.ready || !!end} onClick={() => { void start(); }}><Play />{i18n.formatMessage(terminalMessages.start)}</Button>
      </div>}
    </div>
    {stopped && <div className="flex shrink-0 items-center gap-2 border-t border-white/10 px-3 py-1.5">
      <p className="type-caption min-w-0 flex-1 text-[#a0a0a0]">{status.state === "exited"
        ? i18n.formatMessage(terminalMessages.exited, { code: status.exitCode ?? "?" })
        : i18n.formatMessage(terminalMessages.failed, { error: status.error ?? "" })}</p>
      <Button size="xs" variant="secondary" disabled={starting || !object.view.ready || !!end} onClick={() => { void start(); }}><RotateCcw />{i18n.formatMessage(terminalMessages.restart)}</Button>
    </div>}
    {status.state === "unknown" && !status.integration && <p className="type-caption shrink-0 border-t border-white/10 px-3 py-2 text-[#a0a0a0]">{i18n.formatMessage(terminalMessages.noIntegration)}</p>}
    {message && !stopped && <p className="type-caption shrink-0 break-words border-t border-white/10 px-3 py-2 text-[#f48771]">{i18n.formatMessage(terminalMessages.failed, { error: message })}</p>}
  </div>;
}
