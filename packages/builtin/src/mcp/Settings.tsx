import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, Pencil, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useI18n, useRendererCalls, useRendererConfig } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { Input } from "@atelier/ui/ui/input";
import { Textarea } from "@atelier/ui/ui/textarea";
import { Switch } from "@atelier/ui/ui/switch";
import { Badge } from "@atelier/ui/ui/badge";
import { Spinner } from "@atelier/ui/ui/spinner";
import { StatusIcon } from "@atelier/ui/ui/status";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@atelier/ui/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@atelier/ui/ui/select";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@atelier/ui/ui/item";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@atelier/ui/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@atelier/ui/ui/alert-dialog";
import { mcpMessages as messages } from "../messages/mcp";
import { BuiltinSettings } from "../settings/contract";
import { SaveMcpServer, ReadMcpCredentials, SetMcpServerEnabled, RemoveMcpServer, ConnectMcpServer, DisconnectMcpServer, ResetMcpAuth,
  type McpServerConfig, type McpServerState } from "./contract";
import { slugifyServerId } from "./catalog";
import { draftOf, validateDraft, type McpDraft, type McpField, type McpFieldError } from "./form";
import { phaseTone, useMcpStatus } from "./status";

/** 编辑区：已有服务器读回保存的键值后才可完成；新增服务器从空白开始。 */
interface Editor { draft: McpDraft; ready: boolean; errors: Partial<Record<McpField, McpFieldError>>; failure: string | null; saving: boolean }
const blank = (taken: string[]): McpServerConfig => ({ id: slugifyServerId("", taken), name: "", description: "", enabled: true, mode: "lazy",
  idleSeconds: 300, transport: "stdio", command: "", args: [], cwd: "", url: "", auth: "none" });
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
const summary = (server: McpServerConfig) => server.transport === "stdio" ? [server.command, ...server.args].filter(Boolean).join(" ") : server.url;

/**
 * 服务器逐行列出：启用开关与连接操作即时生效，编辑在行内展开，以「完成」保存、「取消」放弃。
 * 各服务器的操作分别 pending，等待浏览器授权不阻塞其他服务器。
 */
export function McpSettings() {
  const i18n = useI18n(), calls = useRendererCalls(), config = useRendererConfig(BuiltinSettings), id = useId();
  const status = useMcpStatus();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<Readonly<Record<string, string>>>({});
  const [removing, setRemoving] = useState<McpServerConfig | null>(null);
  const lifetime = useRef<AbortController>(new AbortController());
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  const servers = config.mcp.servers;
  // 编辑中的服务器在别处被移除时关闭编辑区。
  useEffect(() => {
    if (editor && !editor.draft.create && !servers.some(server => server.id === editor.draft.server.id)) setEditor(null);
  }, [servers]);

  const run = async (serverId: string, action: (signal: AbortSignal) => Promise<unknown>) => {
    const signal = lifetime.current.signal;
    setPending(current => new Set(current).add(serverId));
    setFailures(({ [serverId]: _, ...rest }) => rest);
    try { await action(signal); return true; }
    catch (error) { if (!signal.aborted) setFailures(current => ({ ...current, [serverId]: messageOf(error) })); return false; }
    finally { if (!signal.aborted) setPending(current => { const next = new Set(current); next.delete(serverId); return next; }); }
  };
  const patch = (next: (draft: McpDraft) => McpDraft) => setEditor(current => current && { ...current, draft: next(current.draft) });
  const update = (value: Partial<McpServerConfig>) => patch(draft => ({ ...draft, server: { ...draft.server, ...value } }));
  const edit = (server: McpServerConfig) => {
    const signal = lifetime.current.signal;
    setEditor({ draft: draftOf(server, {}, false), ready: false, errors: {}, failure: null, saving: false });
    void calls.invoke(ReadMcpCredentials, { serverId: server.id }, { signal }).then(values => {
      if (!signal.aborted) setEditor(current => current?.draft.server.id === server.id && !current.draft.create
        ? { ...current, ready: true, draft: { ...current.draft, entries: draftOf(server, values, false).entries } } : current);
    }, error => {
      if (!signal.aborted) setEditor(current => current?.draft.server.id === server.id ? { ...current, failure: messageOf(error) } : current);
    });
  };
  const add = () => setEditor({ draft: draftOf(blank(servers.map(server => server.id)), {}, true), ready: true, errors: {}, failure: null, saving: false });
  const complete = async () => {
    if (!editor?.ready) return;
    const result = validateDraft(editor.draft, servers.map(server => server.id).filter(item => editor.draft.create || item !== editor.draft.server.id));
    if (!result.ok) { setEditor({ ...editor, errors: result.errors, failure: null }); return; }
    const signal = lifetime.current.signal;
    setEditor({ ...editor, errors: {}, failure: null, saving: true });
    try {
      await calls.invoke(SaveMcpServer, { server: result.server, create: editor.draft.create, credentials: result.credentials }, { signal });
      if (!signal.aborted) setEditor(null);
    } catch (error) {
      if (!signal.aborted) setEditor(current => current && { ...current, saving: false, failure: messageOf(error) });
    }
  };

  const editorView = ({ draft, ready, errors, failure, saving }: Editor) => {
    const disabled = saving || !ready, server = draft.server;
    const field = (key: string, label: ReactNode, control: ReactNode, hint?: ReactNode) => {
      const error = errors[key as McpField];
      return <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
        {control}
        {error ? <FieldError>{i18n.text(messages[error])}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
      </Field>;
    };
    const input = (key: "name" | "description" | "command" | "cwd" | "url", mono = false) =>
      <Input id={`${id}-${key}`} value={server[key]} disabled={disabled} spellCheck={!mono} className={mono ? "font-mono" : undefined}
        aria-invalid={key in errors || undefined}
        onChange={event => key === "name"
          ? patch(current => ({ ...current, server: { ...current.server, name: event.target.value,
            ...(current.create && !current.idEdited && { id: slugifyServerId(event.target.value, servers.map(item => item.id)) }) } }))
          : update({ [key]: event.target.value })} />;
    const select = <K extends "transport" | "mode" | "auth">(key: K, options: [McpServerConfig[K], keyof typeof messages][]) =>
      <Select value={server[key]} disabled={disabled} onValueChange={value => update({ [key]: value } as Partial<McpServerConfig>)}>
        <SelectTrigger id={`${id}-${key}`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([value, label]) => <SelectItem key={value} value={value}>{i18n.text(messages[label])}</SelectItem>)}</SelectContent>
      </Select>;
    return <div className="flex flex-col gap-6 px-4 pb-4">
      <FieldSet>
        <FieldLegend variant="label">{i18n.text(messages.general)}</FieldLegend>
        {field("name", i18n.text(messages.name), input("name"))}
        {field("id", i18n.text(messages.serverId),
          <Input id={`${id}-id`} className="font-mono" value={server.id} disabled={disabled} readOnly={!draft.create} spellCheck={false}
            aria-invalid={"id" in errors || undefined}
            onChange={event => patch(current => ({ ...current, idEdited: true, server: { ...current.server, id: event.target.value } }))} />,
          i18n.text(messages.serverIdHint))}
        {field("description", i18n.text(messages.purpose), input("description"), i18n.text(messages.purposeHint))}
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">{i18n.text(messages.connection)}</FieldLegend>
        {field("transport", i18n.text(messages.transport), select("transport", [["stdio", "stdio"], ["http", "http"]]))}
        {server.transport === "stdio" ? <>
          {field("command", i18n.text(messages.command), input("command", true))}
          {field("args", i18n.text(messages.args),
            <Textarea id={`${id}-args`} rows={3} className="font-mono" disabled={disabled} spellCheck={false} value={draft.args}
              onChange={event => patch(current => ({ ...current, args: event.target.value }))} />, i18n.text(messages.argsHint))}
          {field("cwd", i18n.text(messages.cwd), input("cwd", true), i18n.text(messages.cwdHint))}
        </> : <>
          {field("url", i18n.text(messages.url), input("url", true))}
          {field("auth", i18n.text(messages.auth), select("auth", [["none", "none"], ["oauth", "oauth"]]))}
        </>}
        {field("mode", i18n.text(messages.mode), select("mode", [["lazy", "lazy"], ["eager", "eager"]]))}
        {server.mode === "lazy" && field("idle", i18n.text(messages.ttl),
          <Input id={`${id}-idle`} inputMode="numeric" disabled={disabled} value={draft.idle} aria-invalid={"idle" in errors || undefined}
            onChange={event => patch(current => ({ ...current, idle: event.target.value }))} />)}
        {field("entries", i18n.text(server.transport === "stdio" ? messages.env : messages.headers),
          <Textarea id={`${id}-entries`} rows={4} className="font-mono" disabled={disabled} spellCheck={false} autoComplete="off"
            value={draft.entries} aria-invalid={"entries" in errors || undefined}
            onChange={event => patch(current => ({ ...current, entries: event.target.value }))} />,
          ready ? i18n.text(messages.entriesHint) : i18n.text(messages.loadingEntries))}
      </FieldSet>
      {failure && <p role="alert" className="type-caption text-destructive break-words">{failure}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditor(null)}>{i18n.text(messages.cancel)}</Button>
        <Button size="sm" disabled={disabled} aria-busy={saving} onClick={() => { void complete(); }}>{saving && <Spinner />}{i18n.text(messages.done)}</Button>
      </div>
    </div>;
  };

  const connection = (server: McpServerConfig, state: McpServerState | undefined, busy: boolean) => {
    if (!server.enabled || !state) return null;
    const invoke = (contract: typeof ConnectMcpServer | typeof DisconnectMcpServer) =>
      () => { void run(server.id, signal => calls.invoke(contract, { serverId: server.id }, { signal })); };
    switch (state.connection) {
      case "awaiting_auth": return <>
        {state.authorizationUrl && <Button variant="outline" size="sm" asChild>
          <a href={state.authorizationUrl} target="_blank" rel="noopener noreferrer">{i18n.text(messages.authorize)}</a></Button>}
        <Button variant="ghost" size="sm" disabled={busy} onClick={invoke(DisconnectMcpServer)}>{i18n.text(messages.cancel)}</Button>
      </>;
      case "connecting": return <Button variant="ghost" size="sm" disabled={busy} onClick={invoke(DisconnectMcpServer)}>{i18n.text(messages.cancel)}</Button>;
      case "connected": return <>
        <IconButton label={i18n.text(messages.refresh)} disabled={busy} onClick={invoke(ConnectMcpServer)}><RefreshCw /></IconButton>
        <Button variant="ghost" size="sm" disabled={busy} onClick={invoke(DisconnectMcpServer)}>{i18n.text(messages.disconnect)}</Button>
      </>;
      default: return <Button variant="outline" size="sm" disabled={busy} onClick={invoke(ConnectMcpServer)}>{i18n.text(messages.connect)}</Button>;
    }
  };
  const row = (server: McpServerConfig) => {
    const state = status.servers.find(item => item.id === server.id);
    const editing = editor && !editor.draft.create && editor.draft.server.id === server.id ? editor : null;
    const busy = pending.has(server.id), error = failures[server.id] ?? state?.error;
    const phase = state?.connection ?? "disconnected";
    return <div key={server.id} role="listitem">
      <Item size="sm">
        <StatusIcon tone={server.enabled ? phaseTone[phase] : "neutral"} className="size-4 shrink-0" />
        <ItemContent className="min-w-0">
          <ItemTitle className="min-w-0">
            <span className="truncate">{server.name}</span>
            {!server.enabled && <Badge variant="secondary">{i18n.text(messages.disabled)}</Badge>}
          </ItemTitle>
          <ItemDescription className="truncate font-mono text-xs">{server.id} · {summary(server)}</ItemDescription>
          <ItemDescription className="type-caption">
            {i18n.formatMessage(messages.state, { state: phase })}{" · "}
            {state?.indexed ? i18n.formatMessage(messages.tools, { count: state.toolCount }) : i18n.text(messages.unindexed)}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {connection(server, state, busy || !!editing)}
          <Switch checked={server.enabled} disabled={busy || !!editing} aria-label={i18n.text(messages.enabled)}
            onCheckedChange={enabled => { void run(server.id, signal => calls.invoke(SetMcpServerEnabled, { serverId: server.id, enabled }, { signal })); }} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={i18n.text(messages.actions)}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!!editor} onSelect={() => edit(server)}><Pencil />{i18n.text(messages.edit)}</DropdownMenuItem>
              {server.transport === "http" && server.auth === "oauth" && <DropdownMenuItem
                onSelect={() => { void run(server.id, signal => calls.invoke(ResetMcpAuth, { serverId: server.id }, { signal })); }}>
                <RotateCcw />{i18n.text(messages.resetAuth)}</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(server)}><Trash2 />{i18n.text(messages.remove)}…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </Item>
      {error && !editing && <pre className="type-caption mx-4 mb-3 max-h-32 overflow-auto whitespace-pre-wrap break-words text-destructive select-text">{error}</pre>}
      {editing && editorView(editing)}
    </div>;
  };

  const creating = editor?.draft.create ? editor : null;
  return <div className="flex flex-col gap-4">
    <p className="type-caption">{i18n.text(messages.description)}</p>
    {status.error && <p role="alert" className="type-caption text-destructive">{status.error}</p>}
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="type-label">{i18n.text(messages.servers)}</h4>
        <Button size="sm" disabled={!!editor} onClick={add}>{i18n.text(messages.add)}</Button>
      </div>
      {servers.length > 0 || creating ? <ItemGroup className="surface">
        {servers.flatMap((server, index) => index ? [<ItemSeparator key={`${server.id}-separator`} />, row(server)] : [row(server)])}
        {creating && <div role="listitem">
          {servers.length > 0 && <ItemSeparator />}
          <Item size="sm"><ItemContent><ItemTitle>{creating.draft.server.name || i18n.text(messages.add)}</ItemTitle></ItemContent></Item>
          {editorView(creating)}
        </div>}
      </ItemGroup> : <p className="type-caption text-muted-foreground">{i18n.text(messages.empty)}</p>}
    </div>
    {removing && <RemoveServer server={removing} onClose={() => setRemoving(null)}
      remove={() => run(removing.id, signal => calls.invoke(RemoveMcpServer, { serverId: removing.id }, { signal }))} />}
  </div>;
}

function RemoveServer({ server, remove, onClose }: { server: McpServerConfig; remove(): Promise<boolean>; onClose(): void }) {
  const i18n = useI18n();
  const [saving, setSaving] = useState(false);
  return <AlertDialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{i18n.text(messages.removeTitle)}</AlertDialogTitle>
      <AlertDialogDescription>{i18n.formatMessage(messages.removeDescription, { name: server.name })}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={saving}>{i18n.text(messages.cancel)}</AlertDialogCancel>
      <AlertDialogAction variant="destructive" disabled={saving} aria-busy={saving} onClick={event => {
        event.preventDefault(); setSaving(true);
        void remove().then(removed => { if (removed) onClose(); else setSaving(false); });
      }}>{saving && <Spinner />}{i18n.text(messages.remove)}</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
