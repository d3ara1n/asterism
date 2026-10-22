import { useState } from "react";
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
import { TerminalCard } from "./TerminalCard";
import { prepareTerminalImages } from "./image-renderer";
import { CreateTerminal, TerminalResource, TerminalView, TerminalInput, TerminalRead, TerminalWait, TerminalSee } from "./contract";
import type { z } from "zod";
import { FilePreview } from "../agent/conversation/Files";
import { useRendererObject } from "@atelier/sdk/renderer";

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
        {settings.shell.profiles.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
      </SelectContent></Select></Field>
    {error && <p className="type-caption text-destructive">{error}</p>}
  </CreationForm>;
}
function ReadBody({ result }: ToolRenderProps<z.infer<typeof TerminalRead.schema>>) {
  const data = result?.data;
  return data ? <pre className="type-code max-h-96 overflow-auto whitespace-pre">{data.mode === "raw" ? JSON.stringify(data.text) : data.text}</pre> : null;
}
function ImageBody({ result }: ToolRenderProps<z.infer<typeof TerminalSee.schema>>) {
  const object = useRendererObject();
  return result?.data ? <FilePreview part={{ kind: "file", file: result.data.image, mediaType: "image/png", filename: "terminal.png" }} content={object.content} /> : null;
}
const appearance = { width: 720, height: 440, minWidth: 360, minHeight: 220 };
const header = (label: typeof terminalMessages.input) => function Header({ invocation }: ToolRenderProps) {
  const i18n = useI18n(); return <ToolHeader label={i18n.formatMessage(label)} subject={invocation.resource?.title} monospace />;
};
const inputView = { headerRenderer: header(terminalMessages.input) }, waitView = { headerRenderer: header(terminalMessages.wait) };
const readView = { headerRenderer: header(terminalMessages.read), bodyRenderer: ReadBody };
const imageView = { headerRenderer: header(terminalMessages.see), bodyRenderer: ImageBody };
export default {
  prepare: prepareTerminalImages,
  resources: [{ kind: TerminalResource.kind, label: terminalMessages.terminal, icon: <TerminalSquare className="size-4" />, card: appearance }],
  cards: [cardRenderer(TerminalView, { ...appearance, Body: TerminalCard })],
  creations: [creationEntry(CreateTerminal, { id: "atelier.builtin/terminal.local", label: terminalMessages.terminal, icon: <TerminalSquare className="size-4" />, group: "resources", InputView: TerminalCreation, triggers: { menu: {} } })],
  tools: [
    toolRenderer(TerminalInput, { label: terminalMessages.input, icon: <Keyboard className="size-3.5" />, input: inputView, execution: inputView, result: inputView }),
    toolRenderer(TerminalWait, { label: terminalMessages.wait, icon: <Clock className="size-3.5" />, input: waitView, execution: waitView, result: waitView }),
    toolRenderer(TerminalRead, { label: terminalMessages.read, icon: <BookOpen className="size-3.5" />, input: { headerRenderer: readView.headerRenderer }, execution: readView, result: readView }),
    toolRenderer(TerminalSee, { label: terminalMessages.see, icon: <Eye className="size-3.5" />, input: { headerRenderer: imageView.headerRenderer }, execution: { headerRenderer: imageView.headerRenderer }, result: imageView }),
  ],
} satisfies RendererModule;
