import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Link2 } from "lucide-react";
import type { WorkbenchObject } from "../../../shared/workbench";
import { t } from "../../shared/i18n";
import { useModuleViews } from "../../modules/views";
import { Button } from "../../shared/ui/button";
import { SearchInput } from "../../shared/ui/search-input";
import { Switch } from "../../shared/ui/switch";
import { Spinner } from "../../shared/ui/spinner";
import { Popover, PopoverContent, PopoverTrigger } from "../../shared/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../../shared/ui/command";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useSession } from "../session/state";
import { useWorkbench } from "./context";

/** 授权消费真实链接；在途请求的说明不冒充单条链接的生效状态。 */
export function AccessPanel() {
  const { controller, session, historical } = useWorkbench();
  const { state } = useSession(controller);
  const registry = useModuleViews();
  const [mode, setMode] = useState<"agent" | "resource">("agent");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedResource, setSelectedResource] = useState("");
  const [query, setQuery] = useState("");
  const agents = session.objects.filter(object => object.kind === "atelier.core/agent");
  const byAgent = mode === "agent";
  const choices = byAgent ? agents : session.objects;
  const selectedId = byAgent ? selectedAgent : selectedResource;
  const selected = choices.find(object => object.id === selectedId) ?? choices[0];
  const search = query.trim().toLocaleLowerCase();
  const targets = (byAgent ? session.objects : agents).filter(object => object.id !== selected?.id
    && `${object.title} ${registry.resource(object.kind).label}`.toLocaleLowerCase().includes(search));
  return <IslandPanel title={t.accessLabel} description={historical ? t.viewingHistory : undefined} toolbar={<>
    <div className="flex gap-1">{([["agent", t.byAgent], ["resource", t.byResource]] as const).map(([key, label]) => <Button key={key} size="xs" variant={mode === key ? "secondary" : "ghost"} aria-pressed={mode === key} onClick={() => { setMode(key); setQuery(""); }}>{label}</Button>)}</div>
    <ResourcePicker objects={choices} selected={selected} onSelect={byAgent ? setSelectedAgent : setSelectedResource} label={byAgent ? t.accessRecipient : t.accessTarget} />
    <SearchInput value={query} onChange={setQuery} label={byAgent ? t.searchResources : t.searchObjects} />
    {historical && <div className="flex items-center justify-between gap-2"><p className="type-caption">{t.historyReadOnly}</p><Button size="xs" variant="secondary" onClick={controller.followCursor}>{t.backToLive}</Button></div>}
  </>}>
    {state.status === "error" && <div className="mb-4 space-y-2"><p role="alert" className="type-caption">{state.error}</p><Button variant="secondary" size="sm" onClick={() => { void controller.refresh(); }}>{t.retry}</Button></div>}
    {selected && <h3 className="type-section mb-2 break-words">{byAgent ? t.canAccess(selected.title) : t.accessibleBy(selected.title)}</h3>}
    {selected && targets.map(object => {
      const agent = byAgent ? selected : object, resource = byAgent ? object : selected;
      return <AccessRow key={`${agent.id}:${resource.id}`} agent={agent} resource={resource} object={object} />;
    })}
    {(!selected || !targets.length) && <p className="type-caption py-6 text-center">{query ? t.noMatches : t.accessEmpty}</p>}
    <div className="mt-5 space-y-2 border-t pt-4"><p className="type-caption">{t.accessRequestBoundary}</p><p className="type-caption">{t.accessRules}</p></div>
  </IslandPanel>;
}
function ResourcePicker({ objects, selected, onSelect, label }: { objects: WorkbenchObject[]; selected?: WorkbenchObject; onSelect: (id: string) => void; label: string }) {
  const registry = useModuleViews();
  const [open, setOpen] = useState(false);
  return <div className="space-y-1"><p className="type-label">{label}</p><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
    <Button variant="outline" className="w-full justify-start" role="combobox" aria-expanded={open} aria-label={label} disabled={!objects.length}>
      {selected && <span aria-hidden="true">{registry.resource(selected.kind).icon}</span>}<span className="min-w-0 flex-1 truncate text-left">{selected?.title ?? t.noObjects}</span><ChevronDown />
    </Button></PopoverTrigger><PopoverContent align="start" className="w-72 p-0"><Command>
      <CommandInput placeholder={t.searchObjects} /><CommandList><CommandEmpty>{t.noMatches}</CommandEmpty><CommandGroup>
        {objects.map(object => { const descriptor = registry.resource(object.kind); return <CommandItem key={object.id} value={object.id} keywords={[object.title, descriptor.label]} onSelect={() => { onSelect(object.id); setOpen(false); }}>
          <span aria-hidden="true">{descriptor.icon}</span><span className="min-w-0 flex-1 truncate">{object.title}</span>{selected?.id === object.id && <Check />}
        </CommandItem>; })}
      </CommandGroup></CommandList></Command></PopoverContent></Popover></div>;
}
function AccessRow({ agent, resource, object }: { agent: WorkbenchObject; resource: WorkbenchObject; object: WorkbenchObject }) {
  const { controller, session, ready, busy, historical } = useWorkbench();
  const { state } = useSession(controller);
  const descriptor = useModuleViews().resource(object.kind);
  const linked = session.links.some(link => link.agentId === agent.id && link.resourceId === resource.id);
  const [pending, setPending] = useState<{ desired: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const submitting = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++; setPending(null); submitting.current = false; setError(null); setSaved(null);
    return () => { generation.current++; };
  }, [historical]);
  const change = async (desired: boolean) => {
    if (submitting.current || historical) return;
    const token = ++generation.current;
    submitting.current = true; setPending({ desired }); setError(null); setSaved(null);
    // 等待受理后的读取，而非等到期望值出现：继续或分叉可能已经覆盖这次变更。
    const result = await controller.executeAndRead({ type: "link.set", sessionId: session.id, agentId: agent.id, resourceId: resource.id, linked: desired });
    if (token !== generation.current) return;
    setPending(null); submitting.current = false;
    if (result.ok) {
      const current = controller.getSnapshot();
      if (current.status === "error") setError(current.error);
      else {
        const actual = current.snapshot?.workbench.links.some(link => link.agentId === agent.id && link.resourceId === resource.id) ?? false;
        setSaved(actual === desired ? t.accessSaved : t.accessSuperseded);
      }
    }
    else {
      setError(result.error.message);
      // 此命令的错误在对应行呈现；不清除其他操作产生的错误。
      if (controller.getSnapshot().error === result.error.message) controller.clearError();
    }
  };
  const id = `access-${agent.id}-${resource.id}`;
  return <div className="flex items-start gap-3 border-b py-3 last:border-0">
    <span className="pt-1 text-muted-foreground" aria-hidden="true">{descriptor.icon}</span>
    <div className="min-w-0 flex-1"><label htmlFor={id} className="type-section block cursor-pointer truncate">{object.title}</label>
      <p className="type-caption mt-0.5">{descriptor.label}</p>
      <p className="type-caption mt-1 flex items-center gap-1.5" role={pending || saved ? "status" : undefined}>
        {pending ? <Spinner className="size-3" /> : linked ? <Check className="size-3" /> : <Link2 className="size-3" />}
        {pending ? t.statusBusy : `${linked ? t.linked : t.notLinked}${saved ? ` · ${saved}` : ""}`}
      </p>
      {error && <p role="alert" className="type-caption mt-1 text-destructive">{error}</p>}
    </div><Switch id={id} checked={pending?.desired ?? linked} disabled={!ready || busy || historical || !!pending || state.status !== "ready"}
      aria-label={t.changeAccess(agent.title, resource.title)} aria-busy={!!pending} onCheckedChange={desired => { void change(desired); }} />
  </div>;
}
