import { IslandPanel } from "../../shared/weave/IslandPanel";
import { Button } from "@asterism-app/ui/ui/button";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { Popover, PopoverTrigger, PopoverContent } from "@asterism-app/ui/ui/popover";

import { ChevronDown, Check, Link2 } from "lucide-react";

import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@asterism-app/ui/ui/command";

import { Separator } from "@asterism-app/ui/ui/separator";
import { StatusText } from "@asterism-app/ui/ui/status";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";

import { Switch } from "@asterism-app/ui/ui/switch";
import { errorDisplay } from "../../../shared/error-display.ts";
import type { UiText } from "@asterism-app/sdk/contracts";
import { accessMessages } from "../../messages/access";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { useEffect, useRef, useState } from "react";

import type { WorkbenchObject } from "../../../shared/workbench";

import { useModuleViews } from "../../modules/views";

import { useSession } from "../session/state";
import { useWorkbench } from "./context";

/** Authorization consumes real links; descriptions of in-flight requests do not stand in for the effective state of an individual link. */
export function AccessPanel() {
  const i18n = useI18n();
  const { session } = useWorkbench();
  const registry = useModuleViews();
  const [mode, setMode] = useState<"receiver" | "resource">("receiver");
  const [selectedReceiver, setSelectedReceiver] = useState("");
  const [selectedResource, setSelectedResource] = useState("");
  const [query, setQuery] = useState("");
  const receivers = session.objects.filter(object => registry.resource(object.kind).receivesLinks === true);
  const byReceiver = mode === "receiver";
  const choices = byReceiver ? receivers : session.objects;
  const selectedId = byReceiver ? selectedReceiver : selectedResource;
  const selected = choices.find(object => object.id === selectedId) ?? choices[0];
  const search = query.trim().toLocaleLowerCase(i18n.locale);
  const targets = (byReceiver ? session.objects : receivers).filter(object => object.id !== selected?.id
    && `${object.title} ${i18n.text(registry.resource(object.kind).label)}`.toLocaleLowerCase(i18n.locale).includes(search));
  return <IslandPanel title={i18n.formatMessage(accessMessages.accessLabel)} toolbar={<>
    <ToggleGroup type="single" size="sm" aria-label={i18n.formatMessage(accessMessages.accessLabel)} value={mode} onValueChange={next => { if (next) { setMode(next as typeof mode); setQuery(""); } }}>
      <ToggleGroupItem value="receiver">{i18n.formatMessage(accessMessages.byReceiver)}</ToggleGroupItem>
      <ToggleGroupItem value="resource">{i18n.formatMessage(accessMessages.byResource)}</ToggleGroupItem>
    </ToggleGroup>
    <ResourcePicker objects={choices} selected={selected} onSelect={byReceiver ? setSelectedReceiver : setSelectedResource} label={byReceiver ? i18n.formatMessage(accessMessages.accessRecipient) : i18n.formatMessage(accessMessages.accessTarget)} />
    <SearchInput value={query} onChange={setQuery} label={byReceiver ? i18n.formatMessage(objectsMessages.searchResources) : i18n.formatMessage(objectsMessages.searchObjects)} />
  </>}>
    {selected && <h3 className="type-section mb-2 break-words">{byReceiver ? i18n.formatMessage(accessMessages.canAccess, { title: selected.title }) : i18n.formatMessage(accessMessages.accessibleBy, { title: selected.title })}</h3>}
    {selected && targets.map(object => {
      const receiver = byReceiver ? selected : object, resource = byReceiver ? object : selected;
      return <AccessRow key={`${receiver.id}:${resource.id}`} receiver={receiver} resource={resource} object={object} />;
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
function AccessRow({ receiver, resource, object }: { receiver: WorkbenchObject; resource: WorkbenchObject; object: WorkbenchObject }) {
  const i18n = useI18n();
  const { controller, session, ready } = useWorkbench();
  const { state } = useSession(controller);
  const descriptor = useModuleViews().resource(object.kind);
  const linked = session.links.some(link => link.receiverId === receiver.id && link.resourceId === resource.id);
  const [pending, setPending] = useState<{ desired: boolean } | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const [saved, setSaved] = useState<import("@asterism-app/sdk/contracts").UiText | null>(null);
  const submitting = useRef(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const change = async (desired: boolean) => {
    if (submitting.current) return;
    const scope = operation.current = new AbortController();
    submitting.current = true; setPending({ desired }); setError(null); setSaved(null);
    const result = await controller.execute({ type: "link.set", sessionId: session.id, receiverId: receiver.id, resourceId: resource.id, linked: desired });
    if (scope.signal.aborted) return;
    setPending(null); submitting.current = false;
    if (result.ok) setSaved(accessMessages.accessSaved);
    else setError(errorDisplay(result.error));
  };
  const id = `access-${receiver.id}-${resource.id}`;
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
    </div><Switch id={id} checked={pending?.desired ?? linked} disabled={!ready || !!pending || state.status !== "ready"}
      aria-label={i18n.formatMessage(accessMessages.changeAccess, { receiver: receiver.title, resource: resource.title })} aria-busy={!!pending} onCheckedChange={desired => { void change(desired); }} />
  </div>;
}
