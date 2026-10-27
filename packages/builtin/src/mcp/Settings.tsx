import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { IslandPanel, useI18n, useRendererCalls, useRendererConfig, useRendererIsland } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Input } from "@asterism-app/ui/ui/input";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { StatusIcon } from "@asterism-app/ui/ui/status";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@asterism-app/ui/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@asterism-app/ui/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@asterism-app/ui/ui/alert-dialog";
import { mcpMessages as messages } from "../messages/mcp";
import { BuiltinSettings } from "../settings/contract";
import { SaveMcpServer, ReadMcpCredentials, SetMcpServerEnabled, RemoveMcpServer, ConnectMcpServer, AuthorizeMcpServer, DisconnectMcpServer, ResetMcpAuth,
  type McpServerConfig, type McpServerState } from "./contract";
import { slugifyServerId } from "./catalog";
import { draftOf, validateDraft, type McpDraft, type McpField, type McpFieldError } from "./form";
import { phaseTone, useMcpStatus } from "./status";
import { useLifetimeSignal } from "../shared/use-lifetime";

const blank = (taken: string[]): McpServerConfig => ({ id: slugifyServerId("", taken), name: "", enabled: true, mode: "lazy",
  idleSeconds: 300, transport: "stdio", command: "", args: [], cwd: "", url: "", auth: "none" });
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
const summary = (server: McpServerConfig) => server.transport === "stdio" ? [server.command, ...server.args].filter(Boolean).join(" ") : server.url;
const islandKey = (serverId: string | null) => `mcp:${serverId ?? "new"}`;

/** The backend owns expiration; this clock only renders its remaining time. */
function AuthorizationRemaining({ expiresAt }: { expiresAt: number }) {
  const i18n = useI18n(), [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <span className="block tabular-nums">{i18n.formatMessage(messages.authorizationRemaining, { time })}</span>;
}

/**
 * Servers are listed by row: enable switches and connection actions take effect immediately; clicking a server opens an editor in an island to the right.
 * Each server has independent pending actions; waiting for browser authorization does not block other servers.
 */
export function McpSettings() {
  const i18n = useI18n(), calls = useRendererCalls(), config = useRendererConfig(BuiltinSettings), island = useRendererIsland();
  const status = useMcpStatus();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<Readonly<Record<string, string>>>({});
  const [removing, setRemoving] = useState<McpServerConfig | null>(null);
  const lifetime = useLifetimeSignal();
  const servers = config.mcp.servers;

  /** After successful creation, reopens using the server identity in the same island used when clicking its row. */
  const open = (serverId: string | null, origin?: HTMLElement | null, initial?: McpServerConfig) => island.open({ key: islandKey(serverId), label: messages.server, origin,
    render: () => <McpServerEditor serverId={serverId} initial={initial}
      onCreated={server => { void open(server.id, origin, server); }} /> });
  const run = async (serverId: string, action: (signal: AbortSignal) => Promise<unknown>) => {
    const signal = lifetime();
    setPending(current => new Set(current).add(serverId));
    setFailures(({ [serverId]: _, ...rest }) => rest);
    try { await action(signal); return true; }
    catch (error) { if (!signal.aborted) setFailures(current => ({ ...current, [serverId]: messageOf(error) })); return false; }
    finally { if (!signal.aborted) setPending(current => { const next = new Set(current); next.delete(serverId); return next; }); }
  };

  const connection = (server: McpServerConfig, state: McpServerState | undefined, busy: boolean) => {
    if (!server.enabled || !state) return null;
    const invoke = (contract: typeof ConnectMcpServer | typeof DisconnectMcpServer) =>
      () => { void run(server.id, signal => calls.invoke(contract, { serverId: server.id }, { signal })); };
    switch (state.connection) {
      case "awaiting_auth": return <>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { void run(server.id, async signal => {
          const { url } = await calls.invoke(AuthorizeMcpServer, { serverId: server.id }, { signal });
          if (!signal.aborted) window.open(url, "_blank", "noopener,noreferrer");
        }); }}>{busy && <Spinner data-icon="inline-start" />}{i18n.text(messages.authorize)}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={invoke(DisconnectMcpServer)}>{i18n.text(messages.cancel)}</Button>
      </>;
      case "authorizing": return <>
        {state.authorizationUrl && <Button variant="outline" size="sm" asChild>
          <a href={state.authorizationUrl} target="_blank" rel="noopener noreferrer">{i18n.text(messages.reopenAuthorization)}</a></Button>}
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
    const busy = pending.has(server.id), error = failures[server.id] ?? state?.error;
    const phase = state?.connection ?? "disconnected";
    const oauth = server.transport === "http" && server.auth === "oauth";
    return <div key={server.id} role="listitem">
      <ListRow selected={island.child === islandKey(server.id)} onOpen={origin => { void open(server.id, origin); }}
        media={<StatusIcon tone={server.enabled ? phaseTone[phase] : "neutral"} className="size-4 shrink-0" />}
        title={<span className="flex min-w-0 items-center gap-2"><span className="truncate">{server.name}</span>
          {!server.enabled && <Badge variant="secondary">{i18n.text(messages.disabled)}</Badge>}</span>}
        description={<span className="font-mono text-xs">{server.id} · {summary(server)}</span>}
        details={<>
          <span role="status">{i18n.formatMessage(messages.state, { state: phase })}{" · "}
            {state?.indexed ? i18n.formatMessage(messages.tools, { count: state.toolCount }) : i18n.text(messages.unindexed)}</span>
          {phase === "authorizing" && state?.authorizationExpiresAt != null
            && <AuthorizationRemaining key={state.authorizationExpiresAt} expiresAt={state.authorizationExpiresAt} />}
        </>}
        actions={<>
          {connection(server, state, busy)}
          <Switch checked={server.enabled} disabled={busy} aria-label={i18n.text(messages.enabled)}
            onCheckedChange={enabled => { void run(server.id, signal => calls.invoke(SetMcpServerEnabled, { serverId: server.id, enabled }, { signal })); }} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={i18n.text(messages.actions)}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {oauth && <><DropdownMenuItem
                onSelect={() => { void run(server.id, signal => calls.invoke(ResetMcpAuth, { serverId: server.id }, { signal })); }}>
                <RotateCcw />{i18n.text(messages.resetAuth)}</DropdownMenuItem><DropdownMenuSeparator /></>}
              <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(server)}><Trash2 />{i18n.text(messages.remove)}…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>} />
      {error && <pre className="type-caption mx-4 mb-3 max-h-32 overflow-auto whitespace-pre-wrap break-words text-destructive select-text">{error}</pre>}
    </div>;
  };

  return <div className="flex flex-col gap-4">
    <p className="type-caption">{i18n.text(messages.description)}</p>
    {status.error && <p role="alert" className="type-caption text-destructive">{status.error}</p>}
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="type-label">{i18n.text(messages.servers)}</h4>
        <Button size="sm" onClick={event => { void open(null, event.currentTarget); }}>{i18n.text(messages.add)}</Button>
      </div>
      {servers.length > 0 ? <ItemGroup className="surface">
        {servers.flatMap((server, index) => index ? [<ItemSeparator key={`${server.id}-separator`} />, row(server)] : [row(server)])}
      </ItemGroup> : <p className="type-caption text-muted-foreground">{i18n.text(messages.empty)}</p>}
    </div>
    {removing && <RemoveServer server={removing} onClose={() => setRemoving(null)}
      remove={() => run(removing.id, signal => calls.invoke(RemoveMcpServer, { serverId: removing.id }, { signal }))} />}
  </div>;
}

/**
 * Server editor island: serverId is null for creation. Existing servers can be saved only after their saved key-value pairs have been read;
 * it stays open after saving and uses the saved result as the new baseline. After successful creation, onCreated reopens it using the server identity.
 * Closes the island if the server is removed elsewhere.
 */
function McpServerEditor({ serverId, initial, onCreated }: { serverId: string | null; initial?: McpServerConfig; onCreated(server: McpServerConfig): void }) {
  const i18n = useI18n(), calls = useRendererCalls(), config = useRendererConfig(BuiltinSettings), island = useRendererIsland(), id = useId();
  const servers = config.mcp.servers;
  const create = serverId === null;
  const saved = create ? undefined : servers.find(server => server.id === serverId);
  const source = saved ?? initial;
  const [baseline, setBaseline] = useState<McpDraft>(() => draftOf(source ?? blank(servers.map(server => server.id)), {}, create));
  const [draft, setDraft] = useState(baseline);
  const [ready, setReady] = useState(create);
  const [errors, setErrors] = useState<Partial<Record<McpField, McpFieldError>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<McpServerConfig | null>(null);

  useEffect(() => {
    if (create || !source) return;
    const controller = new AbortController();
    void calls.invoke(ReadMcpCredentials, { serverId: source.id }, { signal: controller.signal }).then(values => {
      if (controller.signal.aborted) return;
      const entries = draftOf(source, values, false).entries;
      setBaseline(current => ({ ...current, entries })); setDraft(current => ({ ...current, entries })); setReady(true);
    }, error => { if (!controller.signal.aborted) setFailure(messageOf(error)); });
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A server that was previously present and disappears is considered removed; configuration may not yet have arrived when reopening after creation, so render initial first.
  const seen = useRef(false);
  useEffect(() => {
    if (create) return;
    if (saved) seen.current = true;
    else if (seen.current || !initial) void island.close({ force: true });
  }, [create, saved, initial, island]);
  // Replace the island with one keyed by server identity after the baseline update takes effect, when there are no unsaved changes.
  useEffect(() => { if (created) onCreated(created); }, [created]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const submit = async () => {
    if (!ready || saving || !dirty) return;
    const result = validateDraft(draft, servers.map(server => server.id).filter(item => create || item !== draft.server.id));
    if (!result.ok) { setErrors(result.errors); setFailure(null); return; }
    setErrors({}); setFailure(null); setSaving(true);
    try {
      await calls.invoke(SaveMcpServer, { server: result.server, create, credentials: result.credentials }, {});
      if (create) { setBaseline(draft); setCreated(result.server); }
      else { const next = draftOf(result.server, result.credentials, false); setBaseline(next); setDraft(next); }
    } catch (error) { setFailure(messageOf(error)); }
    finally { setSaving(false); }
  };

  const disabled = saving || !ready, server = draft.server;
  const patch = (next: (draft: McpDraft) => McpDraft) => setDraft(next);
  const update = (value: Partial<McpServerConfig>) => patch(current => ({ ...current, server: { ...current.server, ...value } }));
  const field = (key: string, label: ReactNode, control: ReactNode) => {
    const error = errors[key as McpField];
    return <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
      {control}
      {error && <FieldError>{i18n.text(messages[error])}</FieldError>}
    </Field>;
  };
  const input = (key: "name" | "command" | "cwd" | "url", mono = false, placeholder?: string) =>
    <Input id={`${id}-${key}`} value={server[key]} placeholder={placeholder} disabled={disabled} spellCheck={!mono} className={mono ? "font-mono" : undefined}
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
  const form = `${id}-form`;
  const title = create ? server.name || i18n.text(messages.add) : source?.name ?? server.name;
  return <IslandPanel title={title} description={create ? i18n.text(messages.server) : source?.id} dirty={dirty}
    action={<Button type="submit" form={form} size="sm" disabled={disabled || !dirty} aria-busy={saving}>{saving && <Spinner />}{i18n.text(messages.save)}</Button>}>
    <form id={form} className="flex flex-col gap-6" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <FieldSet>
        <FieldLegend variant="label">{i18n.text(messages.general)}</FieldLegend>
        {field("name", i18n.text(messages.name), input("name"))}
        {field("id", i18n.text(messages.serverId),
          <Input id={`${id}-id`} className="font-mono" value={server.id} placeholder={i18n.text(messages.serverIdPlaceholder)} disabled={disabled} readOnly={!draft.create} spellCheck={false}
            aria-invalid={"id" in errors || undefined}
            onChange={event => patch(current => ({ ...current, idEdited: true, server: { ...current.server, id: event.target.value } }))} />)}
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">{i18n.text(messages.connection)}</FieldLegend>
        {field("transport", i18n.text(messages.transport), select("transport", [["stdio", "stdio"], ["http", "http"]]))}
        {server.transport === "stdio" ? <>
          {field("command", i18n.text(messages.command), input("command", true))}
          {field("args", i18n.text(messages.args),
            <Textarea id={`${id}-args`} rows={3} className="font-mono" disabled={disabled} spellCheck={false} value={draft.args} placeholder={i18n.text(messages.argsPlaceholder)}
              onChange={event => patch(current => ({ ...current, args: event.target.value }))} />)}
          {field("cwd", i18n.text(messages.cwd), input("cwd", true, i18n.text(messages.cwdPlaceholder)))}
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
            value={draft.entries} aria-invalid={"entries" in errors || undefined} placeholder={i18n.text(ready ? messages.entriesPlaceholder : messages.loadingEntries)}
            onChange={event => patch(current => ({ ...current, entries: event.target.value }))} />)}
      </FieldSet>
      {failure && <p role="alert" className="type-caption text-destructive break-words">{failure}</p>}
    </form>
  </IslandPanel>;
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
