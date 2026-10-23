import { useState, useEffect } from "react";
import { TerminalSquare, Eye, Keyboard, Clock, BookOpen } from "lucide-react";
import { cardRenderer, creationEntry, toolRenderer, useI18n, useRendererConfig, type CreationInputProps, type RendererModule, type ToolRenderProps } from "@atelier/sdk/renderer";
import { Input } from "@atelier/ui/ui/input";
import { Button } from "@atelier/ui/ui/button";
import { Field, FieldLabel } from "@atelier/ui/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@atelier/ui/ui/select";
import { ToolHeader } from "@atelier/ui/tool-header";
import { CreationForm } from "../shared/creation-form";
import { commonMessages } from "../messages/common";
import { filesystemMessages } from "../messages/filesystem";
import { terminalMessages } from "../messages/terminal";
import { BuiltinSettings } from "../settings/contract";
import { TerminalActions, TerminalCard } from "./TerminalCard";
import { prepareTerminalImages } from "./image-renderer";
import { CreateTerminal, TerminalResource, TerminalView, TerminalInput, TerminalRead, TerminalWait, TerminalSee, type TerminalStatus } from "./contract";
import type { z } from "zod";
import { Spinner } from "@atelier/ui/ui/spinner";
import { useRendererObject } from "@atelier/sdk/renderer";
import { mediaMessages } from "../messages/media";
import { inputField, inputText } from "../shared/tool-preview";

function TerminalCreation({ initialInput, busy, resolve, cancel }: CreationInputProps<{ title?: string; cwd?: string; profile?: string }>) {
  const i18n = useI18n(), settings = useRendererConfig(BuiltinSettings);
  const [title, setTitle] = useState(initialInput?.title ?? ""), [cwd, setCwd] = useState(initialInput?.cwd ?? "");
  const [profile, setProfile] = useState(initialInput?.profile ?? "default"), [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <CreationForm busy={busy} disabled={browsing} onCancel={cancel} onSubmit={() => resolve({
    ...(title.trim() ? { title: title.trim() } : {}), ...(cwd.trim() ? { cwd: cwd.trim() } : {}), ...(profile !== "default" ? { profile } : {}),
  })}>
    <Field><FieldLabel htmlFor="terminal-title">{i18n.formatMessage(commonMessages.name)}</FieldLabel>
      <Input id="terminal-title" value={title} autoFocus maxLength={160} placeholder={i18n.formatMessage(terminalMessages.terminal)} onChange={event => setTitle(event.target.value)} /></Field>
    <Field><FieldLabel htmlFor="terminal-cwd">{i18n.formatMessage(terminalMessages.cwd)}</FieldLabel><div className="flex gap-2">
      <Input id="terminal-cwd" value={cwd} spellCheck={false} placeholder={i18n.formatMessage(terminalMessages.cwdHint)} onChange={event => setCwd(event.target.value)} />
      <Button variant="secondary" type="button" disabled={browsing} onClick={() => {
        setBrowsing(true); setError(null);
        void window.host.pickDirectory().then(path => { if (path) setCwd(path); }).catch(failure => setError(String(failure))).finally(() => setBrowsing(false));
      }}>{i18n.formatMessage(filesystemMessages.browse)}</Button></div></Field>
    <Field><FieldLabel>{i18n.formatMessage(terminalMessages.profile)}</FieldLabel>
      <Select value={profile} onValueChange={setProfile}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="default">{i18n.formatMessage(terminalMessages.defaultProfile)}</SelectItem>
        {settings.shell.profiles.map(item => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}
      </SelectContent></Select></Field>
    {error && <p className="type-caption text-destructive">{error}</p>}
  </CreationForm>;
}
function ReadBody({ result }: ToolRenderProps<z.infer<typeof TerminalRead.schema>>) {
  const data = result?.data;
  return data ? <pre className="type-code max-h-96 overflow-auto whitespace-pre">{data.source === "raw" ? JSON.stringify(data.text) : data.text}</pre> : null;
}
function ImageBody({ result }: ToolRenderProps<z.infer<typeof TerminalSee.schema>>) {
  const i18n = useI18n();
  const object = useRendererObject();
  const data = result?.data;
  const imageId = data?.image["$atelier.content"];
  const [url, setUrl] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!imageId) return;
    let active = true, blobUrl: string | undefined;
    setUrl(undefined); setFailed(false);
    void object.content.read({ "$atelier.content": imageId }).then(bytes => {
      if (!active) return;
      blobUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "image/png" }));
      setUrl(blobUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [imageId, object.content]);
  if (!data) return null;
  return <div className="flex flex-col gap-2">
    <div className="overflow-hidden rounded-md border bg-muted">
      {url
        ? <img src={url} alt={`Terminal ${data.cols}×${data.rows}`} className="block w-full" onError={() => setFailed(true)} />
        : <div className="flex min-h-20 items-center justify-center">
            {failed
              ? <p className="type-caption text-destructive">{i18n.text(mediaMessages.unavailable)}</p>
              : <Spinner className="text-muted-foreground" />}
          </div>}
    </div>
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 type-caption text-muted-foreground">
      <span className="font-mono">{data.cols} × {data.rows}</span>
      <span>{i18n.formatMessage(terminalMessages.state, { state: data.state })}</span>
    </div>
  </div>;
}
/** 终端状态行：state · cwd（集成时）· 末次退出码（集成时）· 错误信息 */
function StatusRow({ data }: { data: TerminalStatus }) {
  const i18n = useI18n();
  return <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 type-caption text-muted-foreground">
    <span>{i18n.formatMessage(terminalMessages.state, { state: data.state })}</span>
    {data.integration && data.cwd && <span className="min-w-0 break-all font-mono">{data.cwd}</span>}
    {data.integration && data.lastExitCode !== null && <span>{i18n.formatMessage(terminalMessages.lastExit, { code: data.lastExitCode })}</span>}
    {data.error && <span className="text-destructive break-all">{data.error}</span>}
  </div>;
}
/** 输入内容预览：text → [key] → ↵，按发送顺序拼接 */
function sentDisplay(args: ToolRenderProps["args"]): string | undefined {
  const text = inputText(args, "text"), key = inputText(args, "key"), enter = inputField(args, "enter") === true;
  if (text === undefined && key === undefined && !enter) return undefined;
  let display = text ?? "";
  if (key !== undefined) display += (display ? " " : "") + `[${key}]`;
  if (enter) display += "\u21b5";
  return display || undefined;
}
function InputBody({ args, result }: ToolRenderProps<z.infer<typeof TerminalInput.schema>>) {
  const data = result?.data, display = sentDisplay(args);
  if (display === undefined && !data) return null;
  return <div className="flex flex-col gap-3">
    {display !== undefined && <pre className="type-code m-0 max-h-48 overflow-auto whitespace-pre-wrap break-all">{display}</pre>}
    {data && <StatusRow data={data} />}
  </div>;
}
function WaitBody({ result }: ToolRenderProps<z.infer<typeof TerminalWait.schema>>) {
  const i18n = useI18n(), data = result?.data;
  if (!data) return null;
  return <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 type-caption text-muted-foreground">
    <span>{i18n.formatMessage(terminalMessages.state, { state: data.state })}</span>
    {data.integration && data.cwd && <span className="min-w-0 break-all font-mono">{data.cwd}</span>}
    {data.integration && data.lastExitCode !== null && <span>{i18n.formatMessage(terminalMessages.lastExit, { code: data.lastExitCode })}</span>}
    {data.error && <span className="text-destructive break-all">{data.error}</span>}
    <span>{i18n.formatMessage(terminalMessages.elapsed, { seconds: (data.elapsedMs / 1000).toFixed(1) })}</span>
  </div>;
}
const appearance = { width: 720, height: 440, minWidth: 360, minHeight: 220 };
const header = (label: typeof terminalMessages.input) => function Header({ invocation }: ToolRenderProps) {
  const i18n = useI18n(); return <ToolHeader label={i18n.formatMessage(label)} subject={invocation.resource?.title} monospace />;
};
const inputHeader = { headerRenderer: header(terminalMessages.input) };
const inputBody = { headerRenderer: header(terminalMessages.input), bodyRenderer: InputBody };
const waitHeader = { headerRenderer: header(terminalMessages.wait) };
const waitResult = { headerRenderer: header(terminalMessages.wait), bodyRenderer: WaitBody };
const readView = { headerRenderer: header(terminalMessages.read), bodyRenderer: ReadBody };
const imageView = { headerRenderer: header(terminalMessages.see), bodyRenderer: ImageBody };
export default {
  prepare: prepareTerminalImages,
  resources: [{ kind: TerminalResource.kind, label: terminalMessages.terminal, icon: <TerminalSquare className="size-4" />, card: appearance }],
  cards: [cardRenderer(TerminalView, { ...appearance, Body: TerminalCard, Actions: TerminalActions })],
  creations: [creationEntry(CreateTerminal, { id: "atelier.builtin/terminal.local", label: terminalMessages.terminal, icon: <TerminalSquare className="size-4" />, group: "resources", InputView: TerminalCreation, triggers: { menu: {} } })],
  tools: [
    toolRenderer(TerminalInput, { label: terminalMessages.input, icon: <Keyboard className="size-3.5" />, input: inputHeader, execution: inputBody, result: inputBody }),
    toolRenderer(TerminalWait, { label: terminalMessages.wait, icon: <Clock className="size-3.5" />, input: waitHeader, execution: waitHeader, result: waitResult }),
    toolRenderer(TerminalRead, { label: terminalMessages.read, icon: <BookOpen className="size-3.5" />, input: { headerRenderer: readView.headerRenderer }, execution: readView, result: readView }),
    toolRenderer(TerminalSee, { label: terminalMessages.see, icon: <Eye className="size-3.5" />, input: { headerRenderer: imageView.headerRenderer }, execution: { headerRenderer: imageView.headerRenderer }, result: imageView }),
  ],
} satisfies RendererModule;
