import { useEffect, useId, useRef, useState } from "react";
import { useI18n, useRendererCalls, useRendererConfig } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { Input } from "@atelier/ui/ui/input";
import { Textarea } from "@atelier/ui/ui/textarea";
import { Label } from "@atelier/ui/ui/label";
import { Switch } from "@atelier/ui/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@atelier/ui/ui/select";
import { Item, ItemContent, ItemTitle, ItemDescription, ItemActions, ItemGroup } from "@atelier/ui/ui/item";
import { mcpMessages as messages } from "../messages/mcp";
import { BuiltinSettings } from "../settings/contract";
import { SaveMcpServer, RemoveMcpServer, ConnectMcpServer, DisconnectMcpServer, ResetMcpAuth, mcpServerSchema, type McpServerConfig } from "./contract";
import { parseCredentialLines } from "./catalog";
import { useMcpStatus } from "./status";

interface Draft { server: McpServerConfig; credentials: string; clear: boolean }
export function McpSettings() {
  const i18n = useI18n(), calls = useRendererCalls(), config = useRendererConfig(BuiltinSettings), id = useId();
  const status = useMcpStatus();
  const [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const lifetime = useRef(new AbortController());
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  const work = async (action: (signal: AbortSignal) => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await action(lifetime.current.signal); return true; }
    catch (failure) { if (!lifetime.current.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure)); return false; }
    finally { if (!lifetime.current.signal.aborted) setBusy(false); }
  };
  const update = (patch: Partial<McpServerConfig>) => setDraft(current => current && { ...current, server: { ...current.server, ...patch } });
  const open = (server: McpServerConfig) => { setDraft({ server: structuredClone(server), credentials: "", clear: false }); setError(null); };
  const save = async () => {
    if (!draft) return;
    let server: McpServerConfig, credentials: Record<string, string> | undefined;
    try { server = mcpServerSchema.parse(draft.server); credentials = draft.clear ? {} : draft.credentials.trim() ? parseCredentialLines(draft.credentials) : undefined; }
    catch { setError(i18n.text(messages.invalid)); return; }
    if (await work(signal => calls.invoke(SaveMcpServer, { server, ...(credentials !== undefined && { credentials }) }, { signal }))) setDraft(null);
  };
  const field = (key: "name" | "description" | "command" | "cwd" | "url", label: keyof typeof messages) => <div className="flex flex-col gap-2">
    <Label htmlFor={`${id}-${key}`}>{i18n.text(messages[label])}</Label>
    <Input id={`${id}-${key}`} value={draft!.server[key]} disabled={busy} onChange={event => update({ [key]: event.target.value })} />
  </div>;
  const select = (key: "transport" | "mode" | "auth", values: [string, keyof typeof messages][]) => <div className="flex flex-col gap-2">
    <Label htmlFor={`${id}-${key}`}>{i18n.text(messages[key])}</Label>
    <Select value={draft!.server[key]} disabled={busy} onValueChange={value => update({ [key]: value })}>
      <SelectTrigger id={`${id}-${key}`}><SelectValue /></SelectTrigger><SelectContent>{values.map(([value, label]) => <SelectItem key={value} value={value}>{i18n.text(messages[label])}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
  return <div className="flex flex-col gap-4">
    <p className="type-caption">{i18n.text(messages.description)}</p>
    {(error || status.error) && <p role="alert" className="type-caption text-destructive">{error ?? status.error}</p>}
    <ItemGroup className="surface">
      {config.mcp.servers.map(server => {
        const state = status.servers.find(item => item.id === server.id);
        return <Item key={server.id} className="flex-wrap">
          <ItemContent><ItemTitle>{server.name}</ItemTitle><ItemDescription>
            {i18n.formatMessage(messages.state, { state: state?.connection ?? "disconnected" })}{" · "}
            {state?.indexed ? i18n.formatMessage(messages.tools, { count: state.toolCount }) : i18n.text(messages.unindexed)}
          </ItemDescription>{state?.error && <p className="type-caption text-destructive break-words">{state.error}</p>}
          {state?.authorizationUrl && <a href={state.authorizationUrl} target="_blank" rel="noopener noreferrer" className="type-caption text-primary-text underline">{i18n.text(messages.authorize)}</a>}
          </ItemContent>
          <ItemActions className="flex-wrap">
            <Button variant="outline" size="sm" disabled={busy || !server.enabled} onClick={() => { void work(signal => calls.invoke(ConnectMcpServer, { serverId: server.id }, { signal })); }}>{i18n.text(messages.connect)}</Button>
            {state && state.connection !== "disconnected" && <Button variant="ghost" size="sm" disabled={busy} onClick={() => { void work(signal => calls.invoke(DisconnectMcpServer, { serverId: server.id }, { signal })); }}>{i18n.text(messages.disconnect)}</Button>}
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => open(server)}>{i18n.text(messages.edit)}</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => { void work(signal => calls.invoke(RemoveMcpServer, { serverId: server.id }, { signal })); }}>{i18n.text(messages.remove)}</Button>
            {server.auth === "oauth" && <Button variant="ghost" size="sm" disabled={busy} onClick={() => { void work(signal => calls.invoke(ResetMcpAuth, { serverId: server.id }, { signal })); }}>{i18n.text(messages.resetAuth)}</Button>}
          </ItemActions>
        </Item>;
      })}
    </ItemGroup>
    {!draft ? <Button variant="outline" className="self-start" disabled={busy} onClick={() => open({ id: crypto.randomUUID(), name: "", description: "", enabled: true, mode: "lazy", idleSeconds: 300, transport: "stdio", command: "", args: [], cwd: "", url: "", auth: "none" })}>{i18n.text(messages.add)}</Button>
      : <div className="surface flex flex-col gap-4 p-4">
        {field("name", "name")}{field("description", "purpose")}
        <div className="flex items-center justify-between"><Label htmlFor={`${id}-enabled`}>{i18n.text(messages.enabled)}</Label><Switch id={`${id}-enabled`} checked={draft.server.enabled} disabled={busy} onCheckedChange={enabled => update({ enabled })} /></div>
        {select("transport", [["stdio", "stdio"], ["http", "http"]])}
        {draft.server.transport === "stdio" ? <>
          {field("command", "command")}
          <div className="flex flex-col gap-2"><Label htmlFor={`${id}-args`}>{i18n.text(messages.args)}</Label><Textarea id={`${id}-args`} rows={3} className="font-mono" disabled={busy} value={draft.server.args.join("\n")} onChange={event => update({ args: event.target.value ? event.target.value.split("\n") : [] })} /></div>
          {field("cwd", "cwd")}
        </> : <>{field("url", "url")}{select("auth", [["none", "none"], ["oauth", "oauth"]])}</>}
        {select("mode", [["lazy", "lazy"], ["eager", "eager"]])}
        {draft.server.mode === "lazy" && <div className="flex flex-col gap-2"><Label htmlFor={`${id}-ttl`}>{i18n.text(messages.ttl)}</Label><Input id={`${id}-ttl`} type="number" min={1} max={86400} disabled={busy} value={draft.server.idleSeconds} onChange={event => update({ idleSeconds: Number(event.target.value) })} /></div>}
        <div className="flex flex-col gap-2"><Label htmlFor={`${id}-credentials`}>{i18n.text(draft.server.transport === "stdio" ? messages.env : messages.headers)}</Label>
          <Textarea id={`${id}-credentials`} className="font-mono" rows={3} autoComplete="off" disabled={busy} value={draft.credentials} onChange={event => setDraft({ ...draft, credentials: event.target.value, clear: false })} />
          <p className="type-caption text-muted-foreground">{i18n.text(messages.secretHint)}</p>
          <Button variant={draft.clear ? "secondary" : "ghost"} size="sm" className="self-start" disabled={busy} onClick={() => setDraft({ ...draft, credentials: "", clear: !draft.clear })}>{i18n.text(messages.clear)}</Button>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>{i18n.text(messages.cancel)}</Button><Button disabled={busy} onClick={() => { void save(); }}>{i18n.text(messages.save)}</Button></div>
      </div>}
  </div>;
}
