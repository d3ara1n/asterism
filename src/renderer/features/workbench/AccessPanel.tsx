import { IslandPanel } from "../../shared/weave/IslandPanel";
import { Button } from "../../shared/ui/button";
import { SearchInput } from "../../shared/ui/search-input";
import { Popover, PopoverTrigger, PopoverContent } from "../../shared/ui/popover";

import { ChevronDown, Check, Link2 } from "lucide-react";

import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "../../shared/ui/command";

import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Separator } from "../../shared/ui/separator";
import { StatusText } from "../../shared/ui/status";
import { ToggleGroup, ToggleGroupItem } from "../../shared/ui/toggle-group";

import { Switch } from "../../shared/ui/switch";
import { errorDisplay } from "../../../shared/error-display.ts";
import type { UiText } from "@atelier/sdk/contracts";
import { accessMessages } from "../../messages/access";
import { commonMessages } from "../../messages/common";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { useEffect, useRef, useState } from "react";

import type { WorkbenchObject } from "../../../shared/workbench";

import { useModuleViews } from "../../modules/views";

import { useSession } from "../session/state";
import { useWorkbench } from "./context";

/** 授权消费真实链接；在途请求的说明不冒充单条链接的生效状态。 */
export function AccessPanel() {
  const i18n = useI18n();
  const { controller, session } = useWorkbench();
  const { state } = useSession(controller);
  const registry = useModuleViews();
  const [mode, setMode] = useState<"agent" | "resource">("agent");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedResource, setSelectedResource] = useState("");
  const [query, setQuery] = useState("");
  const agents = session.objects.filter(object => registry.resource(object.kind).receivesLinks === true);
  const byAgent = mode === "agent";
  const choices = byAgent ? agents : session.objects;
  const selectedId = byAgent ? selectedAgent : selectedResource;
  const selected = choices.find(object => object.id === selectedId) ?? choices[0];
  const search = query.trim().toLocaleLowerCase(i18n.locale);
  const targets = (byAgent ? session.objects : agents).filter(object => object.id !== selected?.id
    && `${object.title} ${i18n.text(registry.resource(object.kind).label)}`.toLocaleLowerCase(i18n.locale).includes(search));
  return <IslandPanel title={i18n.formatMessage(accessMessages.accessLabel)} toolbar={<>
    <ToggleGroup type="single" size="sm" aria-label={i18n.formatMessage(accessMessages.accessLabel)} value={mode} onValueChange={next => { if (next) { setMode(next as typeof mode); setQuery(""); } }}>
      <ToggleGroupItem value="agent">{i18n.formatMessage(accessMessages.byAgent)}</ToggleGroupItem>
      <ToggleGroupItem value="resource">{i18n.formatMessage(accessMessages.byResource)}</ToggleGroupItem>
    </ToggleGroup>
    <ResourcePicker objects={choices} selected={selected} onSelect={byAgent ? setSelectedAgent : setSelectedResource} label={byAgent ? i18n.formatMessage(accessMessages.accessRecipient) : i18n.formatMessage(accessMessages.accessTarget)} />
    <SearchInput value={query} onChange={setQuery} label={byAgent ? i18n.formatMessage(objectsMessages.searchResources) : i18n.formatMessage(objectsMessages.searchObjects)} />
  </>}>
    {state.status === "error" && <Alert variant="destructive" className="mb-4"><AlertDescription>{i18n.text(state.error ?? "")}<Button variant="outline" size="sm" className="mt-2" onClick={() => { void controller.refresh(); }}>{i18n.formatMessage(commonMessages.retry)}</Button></AlertDescription></Alert>}
    {selected && <h3 className="type-section mb-2 break-words">{byAgent ? i18n.formatMessage(accessMessages.canAccess, { title: selected.title }) : i18n.formatMessage(accessMessages.accessibleBy, { title: selected.title })}</h3>}
    {selected && targets.map(object => {
      const agent = byAgent ? selected : object, resource = byAgent ? object : selected;
      return <AccessRow key={`${agent.id}:${resource.id}`} agent={agent} resource={resource} object={object} />;
    })}
    {(!selected || !targets.length) && <p className="type-caption py-6 text-center">{query ? i18n.formatMessage(commonMessages.noMatches) : i18n.formatMessage(accessMessages.accessEmpty)}</p>}
    <Separator className="mt-5 mb-4" /><div className="space-y-2"><p className="type-caption">{i18n.formatMessage(accessMessages.accessRequestBoundary)}</p><p className="type-caption">{i18n.formatMessage(accessMessages.accessRules)}</p></div>
  </IslandPanel>;
}
function ResourcePicker({ objects, selected, onSelect, label }: { objects: WorkbenchObject[]; selected?: WorkbenchObject; onSelect: (id: string) => void; label: string }) {
  const i18n = useI18n();
  const registry = useModuleViews();
  const [open, setOpen] = useState(false);
  return <div className="space-y-1"><p className="type-label">{label}</p><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
    <Button variant="outline" className="w-full justify-start" role="combobox" aria-expanded={open} aria-label={label} disabled={!objects.length}>
      {selected && <span aria-hidden="true">{registry.resource(selected.kind).icon}</span>}<span className="min-w-0 flex-1 truncate text-left">{selected?.title ?? i18n.formatMessage(objectsMessages.noObjects)}</span><ChevronDown />
    </Button></PopoverTrigger><PopoverContent align="start" className="w-72 p-0"><Command>
      <CommandInput placeholder={i18n.formatMessage(objectsMessages.searchObjects)} /><CommandList><CommandEmpty>{i18n.formatMessage(commonMessages.noMatches)}</CommandEmpty><CommandGroup>
        {objects.map(object => { const descriptor = registry.resource(object.kind); return <CommandItem key={object.id} value={object.id} keywords={[object.title, i18n.text(descriptor.label)]} onSelect={() => { onSelect(object.id); setOpen(false); }}>
          <span aria-hidden="true">{descriptor.icon}</span><span className="min-w-0 flex-1 truncate">{object.title}</span>{selected?.id === object.id && <Check />}
        </CommandItem>; })}
      </CommandGroup></CommandList></Command></PopoverContent></Popover></div>;
}
function AccessRow({ agent, resource, object }: { agent: WorkbenchObject; resource: WorkbenchObject; object: WorkbenchObject }) {
  const i18n = useI18n();
  const { controller, session, ready, busy } = useWorkbench();
  const { state } = useSession(controller);
  const descriptor = useModuleViews().resource(object.kind);
  const linked = session.links.some(link => link.agentId === agent.id && link.resourceId === resource.id);
  const [pending, setPending] = useState<{ desired: boolean } | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const [saved, setSaved] = useState<import("@atelier/sdk/contracts").UiText | null>(null);
  const submitting = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const change = async (desired: boolean) => {
    if (submitting.current) return;
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
        setSaved(actual === desired ? accessMessages.accessSaved : i18n.formatMessage(accessMessages.accessSuperseded));
      }
    }
    else {
      setError(errorDisplay(result.error));
      // 此命令的错误在对应行呈现；不清除其他操作产生的错误。
      if (controller.getSnapshot().error === errorDisplay(result.error)) controller.clearError();
    }
  };
  const id = `access-${agent.id}-${resource.id}`;
  return <div className="flex items-start gap-3 border-b py-3 last:border-0">
    <span className="pt-1 text-muted-foreground" aria-hidden="true">{descriptor.icon}</span>
    <div className="min-w-0 flex-1"><label htmlFor={id} className="type-section block cursor-pointer truncate">{object.title}</label>
      <p className="type-caption mt-0.5">{i18n.text(descriptor.label)}</p>
      <p className="mt-1" role={pending || saved ? "status" : undefined}>
        <StatusText tone={pending ? "progress" : linked ? "success" : "neutral"} icon={pending ? undefined : linked ? Check : Link2}>
          {pending ? i18n.formatMessage(commonMessages.statusBusy) : `${linked ? i18n.formatMessage(accessMessages.linked) : i18n.formatMessage(accessMessages.notLinked)}${saved ? ` · ${i18n.text(saved)}` : ""}`}
        </StatusText>
      </p>
      {error && <p role="alert" className="mt-1"><StatusText tone="error">{i18n.text(error)}</StatusText></p>}
    </div><Switch id={id} checked={pending?.desired ?? linked} disabled={!ready || busy || !!pending || state.status !== "ready"}
      aria-label={i18n.formatMessage(accessMessages.changeAccess, { agent: agent.title, resource: resource.title })} aria-busy={!!pending} onCheckedChange={desired => { void change(desired); }} />
  </div>;
}
