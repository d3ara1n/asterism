import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Eye, GitBranch, History, Layers, MoreHorizontal, PanelsTopLeft } from "lucide-react";
import { sessionPath, snap } from "../../../shared/session-path";
import { Button } from "../../shared/ui/button";
import { SearchInput } from "../../shared/ui/search-input";
import { Spinner } from "../../shared/ui/spinner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../shared/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../../shared/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../../shared/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../shared/ui/alert-dialog";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useModuleViews } from "../../modules/views";
import { t } from "../../shared/i18n";
import type { SessionController } from "./controller";
import { useSession, useSessionProgress } from "./state";
import { historyBefore, historyEntries, historyResources, historyResourceViews, matchesHistoryView, type HistoryView, type HistoryEntry } from "./history-navigation";

/** 历史逐节点导航；正文阅读与 response 聚合属于代理卡片。 */
export function SessionHistoryPanel({ controller }: { controller: SessionController }) {
  const { snapshot, state, historical } = useSession(controller);
  const registry = useModuleViews();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<HistoryView>({ kind: "all" });
  const [currentOnly, setCurrentOnly] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const entries = useMemo(() => snapshot ? historyEntries(snapshot.nodes, kind => registry.resource(kind).label) : [], [snapshot?.nodes, registry]);
  const cursorPath = useMemo(() => new Set(snapshot ? sessionPath(snapshot.nodes, snapshot.cursor).map(node => node.id) : []), [snapshot?.nodes, snapshot?.cursor]);
  const search = query.trim().toLocaleLowerCase();
  const visible = entries.filter(entry => (!currentOnly || cursorPath.has(entry.node.id)) && matchesHistoryView(entry, view)
    && (!search || `${"text" in entry.node ? entry.node.text : entry.label} ${entry.resource?.title ?? t.workbench} ${entry.resource ? registry.resource(entry.resource.kind).label : ""}`.toLocaleLowerCase().includes(search)));
  useLayoutEffect(() => {
    if (!snapshot || state.status !== "ready" || positioned.current) return;
    positioned.current = true;
    list.current?.querySelector<HTMLElement>('[data-inspected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [snapshot, state.status]);
  if (!snapshot) return <IslandPanel title={t.history}><p className="type-caption">{state.error ?? t.openingBody}</p></IslandPanel>;
  const selected = entries.find(entry => entry.node.id === snapshot.at);
  const selectedVisible = snapshot.at === null || visible.some(entry => entry.node.id === snapshot.at);
  return <IslandPanel title={t.history} compact contentRef={list} action={<ContinueAction controller={controller} />} toolbar={<>
    <SearchInput value={query} onChange={setQuery} label={t.searchHistory} />
    <div className="flex items-center justify-between gap-1">
      <HistoryViewPicker entries={entries} value={view} onChange={next => { setView(next); if (list.current) list.current.scrollTop = 0; }} />
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="xs" variant="ghost">{currentOnly ? t.currentPath : t.allPaths}<ChevronDown /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setCurrentOnly(false)}>{t.allPaths}</DropdownMenuItem><DropdownMenuItem onSelect={() => setCurrentOnly(true)}>{t.currentPath}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    <div className="flex items-center justify-between gap-2"><p className="type-caption min-w-0 truncate" title={selected?.label ?? t.historyStart}>
      {state.status === "loading" ? t.openingBody : historical ? snapshot.at === null ? t.historyStart : t.viewingHistory : t.live}</p>
      {historical && <Button size="xs" variant="secondary" onClick={() => { positioned.current = false; controller.followCursor(); }}>{t.backToLive}</Button>}</div>
    {!selectedVisible && (search || view.kind !== "all" || currentOnly) && <p className="type-caption">{t.historyFiltered}</p>}
    {state.error && <p role="alert" className="type-caption">{state.error}</p>}
  </>}>
    {visible.map(entry => {
      const { node, resource } = entry;
      const descriptor = registry.resource(resource?.kind ?? "");
      const source = entry.scope === "session" ? `${t.sessionEvents} · ${t.workbench}` : `${descriptor.label} · ${resource?.title ?? t.unknownResource}`;
      const active = snapshot.at === node.id;
      return <div key={node.id} data-inspected={active} className="flex items-center gap-0.5">
        <Button variant={active ? "secondary" : "ghost"} aria-pressed={active} className="h-auto min-w-0 flex-1 justify-start gap-3 px-2 py-1.5 text-left font-normal"
          title={`${entry.label}\n${source}\n${new Date(node.createdAt).toLocaleString()}`} onClick={() => controller.inspect(node.id)}>
          <span className="shrink-0 text-muted-foreground" aria-hidden="true">{entry.scope === "session" ? <PanelsTopLeft className="size-4" /> : descriptor.icon}</span>
          <span className="min-w-0 flex-1"><span className="block truncate leading-5">{entry.label}</span><span className="type-caption block truncate leading-4">{source}</span></span>
          {!cursorPath.has(node.id) && <GitBranch className="size-3 text-muted-foreground" aria-label={t.otherPath} />}
          {active && <Eye className="size-3" aria-label={t.viewingHistory} />}
        </Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={t.historyEntryActions}><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => controller.inspect(historyBefore(snapshot.nodes, node))}>{t.historyBefore}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => controller.inspect(node.id)}>{t.historyAfter}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>;
    })}
    {!visible.length && <p className="type-caption px-2 py-6 text-center">{t.noMatches}</p>}
  </IslandPanel>;
}

function HistoryViewPicker({ entries, value, onChange }: { entries: HistoryEntry[]; value: HistoryView; onChange: (view: HistoryView) => void }) {
  const registry = useModuleViews();
  const [open, setOpen] = useState(false);
  const sources = useMemo(() => historyResourceViews(entries), [entries]);
  const presets = [
    { kind: "all" as const, label: t.historyAllRecords, icon: <History className="size-4" /> },
    { kind: "workbench" as const, label: t.historyWorkbenchEvents, icon: <PanelsTopLeft className="size-4" /> },
    { kind: "resources" as const, label: t.historyAllResourceEvents, icon: <Layers className="size-4" /> },
  ];
  const resource = value.kind === "resource" ? sources.find(source => source.resource.id === value.resourceId)?.resource : undefined;
  const preset = presets.find(item => item.kind === value.kind);
  const label = resource?.title ?? preset?.label ?? t.unknownResource;
  const icon = resource ? registry.resource(resource.kind).icon : preset?.icon;
  const choose = (view: HistoryView) => { onChange(view); setOpen(false); };
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
    <Button variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label={`${t.historyView}: ${label}`} title={label} className="min-w-0 flex-1 justify-start">
      <span aria-hidden="true">{icon}</span><span className="min-w-0 flex-1 truncate text-left">{label}</span><ChevronDown />
    </Button></PopoverTrigger><PopoverContent align="start" className="w-80 p-0"><Command>
      <CommandInput placeholder={t.searchHistoryViews} /><CommandList><CommandEmpty>{t.noMatches}</CommandEmpty>
        <CommandGroup>{presets.map(item => <CommandItem key={item.kind} value={`view:${item.kind}`} keywords={[item.label]} onSelect={() => choose({ kind: item.kind })}>
          <span aria-hidden="true">{item.icon}</span><span className="flex-1">{item.label}</span>{value.kind === item.kind && <Check aria-hidden="true" />}
        </CommandItem>)}</CommandGroup>
        {sources.length > 0 && <><CommandSeparator /><CommandGroup heading={t.historySources}>
          {sources.map(({ resource, count }) => { const descriptor = registry.resource(resource.kind); return <CommandItem key={resource.id} value={`resource:${resource.id}`} keywords={[resource.title, descriptor.label]}
            onSelect={() => choose({ kind: "resource", resourceId: resource.id })}>
            <span aria-hidden="true">{descriptor.icon}</span><span className="min-w-0 flex-1"><span className="block truncate">{resource.title}</span><span className="type-caption block">{descriptor.label}</span></span>
            <span className="type-caption tabular-nums">{count}</span>{value.kind === "resource" && value.resourceId === resource.id && <Check aria-hidden="true" />}
          </CommandItem>; })}
        </CommandGroup></>}
      </CommandList></Command></PopoverContent></Popover>;
}

/** 进度订阅只刷新继续操作，不使整份历史列表随流增量重渲染。 */
function ContinueAction({ controller }: { controller: SessionController }) {
  const { snapshot, state, historical } = useSession(controller);
  const progress = useSessionProgress(controller);
  const registry = useModuleViews();
  const [target, setTarget] = useState<{ id: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const resources = useMemo(() => historyResources(snapshot?.nodes ?? []), [snapshot?.nodes]);
  if (!snapshot) return null;
  const unsettled = progress.unsettledObjectIds.length > 0;
  const wait = t.waitForResources(progress.unsettledObjectIds.map(id => resources.get(id)?.title ?? t.unknownResource).join(", "));
  const disabled = saving || unsettled || state.busy || state.status !== "ready";
  const actual = target?.id ? snap(snapshot.nodes, target.id) : null;
  const actualEntry = target ? historyEntries(snapshot.nodes, kind => registry.resource(kind).label).find(entry => entry.node.id === actual) : undefined;
  return <><span title={unsettled ? wait : t.continueFromHere}><Button size="xs" disabled={!historical || disabled} onClick={() => setTarget({ id: snapshot.at })}><GitBranch />{t.continueFromHere}</Button></span>
    <AlertDialog open={target !== null} onOpenChange={open => { if (!open && !saving) setTarget(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{t.continueTitle}</AlertDialogTitle><AlertDialogDescription>{t.continueDescription}</AlertDialogDescription></AlertDialogHeader>
      {target && actual !== target.id && <p className="type-caption">{t.continueAdjusted}</p>}
      <p className="type-body break-words">{actualEntry?.label ?? t.historyStart}</p>
      {unsettled && <p className="type-caption">{wait}</p>}
      {state.error && <p className="type-caption" role="alert">{state.error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={saving}>{t.cancel}</AlertDialogCancel><AlertDialogAction disabled={disabled} aria-busy={saving} onClick={event => {
        event.preventDefault(); if (!target) return; setSaving(true);
        void controller.branchFrom(target.id).then(result => { if (result.ok) setTarget(null); }).finally(() => setSaving(false));
      }}>{saving && <Spinner />}{t.continueConfirm}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog></>;
}
