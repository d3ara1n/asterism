import { CircleDot, History, Eye, PanelsTopLeft, MoreHorizontal, ArrowUpLeft, GitBranch, ChevronDown, Layers, Check } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { snap } from "../../../shared/session-path";
import { commonMessages } from "../../messages/common";
import { historyMessages } from "../../messages/history";
import { useModuleViews } from "../../modules/views";
import { getI18n, useI18n } from "../../shared/i18n";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "../../shared/ui/alert-dialog";
import { Button } from "../../shared/ui/button";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "../../shared/ui/command";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../shared/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "../../shared/ui/popover";
import { SearchInput } from "../../shared/ui/search-input";
import { Spinner } from "../../shared/ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../shared/ui/tabs";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import type { SessionController } from "./controller";
import { arrivedBranch, branchContains, historyBranches, viewedBranch, type BranchNavigation, type HistoryBranch } from "./history-branches";
import { historyBefore, historyEntries, historyResources, historyResourceViews, matchesHistoryView, type HistoryView, type HistoryEntry } from "./history-navigation";
import { useSession, useSessionProgress } from "./state";

const branchLabel = (branch: HistoryBranch) => branch.number === 0 ? getI18n().formatMessage(historyMessages.historyMainBranch) : getI18n().formatMessage(historyMessages.historyBranch, { number: branch.number });

/** 历史逐节点导航；正文阅读与 response 聚合属于代理卡片。 */
export function SessionHistoryPanel({ controller }: { controller: SessionController }) {
  const i18n = useI18n();
  const { snapshot, state, historical } = useSession(controller);
  const registry = useModuleViews();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<HistoryView>({ kind: "all" });
  const [preferredBranch, setPreferredBranch] = useState<string | null>(null);
  const pending = useRef<BranchNavigation | null>(null);
  const focusOrigin = useRef<Element | null>(null);
  const remembered = useRef(new Map<string, string | null>());
  const list = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const scrollRequested = useRef(true);
  const entries = useMemo(() => snapshot ? historyEntries(snapshot.nodes, kind => i18n.text(registry.resource(kind).label)) : [], [snapshot?.nodes, registry, i18n]);
  const tree = useMemo(() => historyBranches(snapshot?.nodes ?? []), [snapshot?.nodes]);
  const arrived = arrivedBranch(pending.current, state);
  const branch = viewedBranch(tree, snapshot?.at ?? null, historical ? arrived ?? preferredBranch : null);
  const executionBranch = viewedBranch(tree, snapshot?.cursor ?? null);
  const branchesByFork = useMemo(() => {
    const result = new Map<string | null, HistoryBranch[]>();
    for (const child of tree.branches) {
      if (child.parentId !== branch.id) continue;
      const siblings = result.get(child.forkId);
      if (siblings) siblings.push(child);
      else result.set(child.forkId, [child]);
    }
    return result;
  }, [tree, branch.id]);
  const parent = tree.branches.find(item => item.id === branch.parentId);
  const search = query.trim().toLocaleLowerCase(i18n.locale);
  const visible = entries.filter(entry => branch.nodeIds.has(entry.node.id) && matchesHistoryView(entry, view)
    && (!search || `${"text" in entry.node ? entry.node.text : i18n.text(entry.label)} ${entry.resource?.title ?? i18n.formatMessage(commonMessages.workbench)} ${entry.resource ? i18n.text(registry.resource(entry.resource.kind).label) : ""}`.toLocaleLowerCase(i18n.locale).includes(search)));
  const showStart = branch.forkId === null && !search && view.kind === "all";
  const navigate = (target: HistoryBranch, at?: string | null, reveal = false) => {
    const last = remembered.current.get(target.id);
    const nodeId = at !== undefined ? at : last !== undefined && branchContains(target, last) ? last : target.tip;
    if (reveal) { setQuery(""); setView({ kind: "all" }); }
    focusOrigin.current = at !== undefined ? document.activeElement : null;
    scrollRequested.current = true;
    controller.inspect(nodeId);
    pending.current = { branchId: target.id, nodeId, version: controller.getSnapshot().navigationVersion };
  };
  const inspect = (at: string | null) => navigate(viewedBranch(tree, at, branch.id), at);
  useLayoutEffect(() => {
    // 旧 Tab 移除后承接焦点；等待期间用户已移到搜索等控件时，不夺回焦点。
    const transferFocus = arrived && focusOrigin.current && (document.activeElement === focusOrigin.current
      || document.activeElement === document.body || list.current?.contains(document.activeElement));
    if (state.status !== "loading") { pending.current = null; focusOrigin.current = null; }
    if (!snapshot || state.status !== "ready") return;
    setPreferredBranch(branch.id);
    remembered.current.set(branch.id, snapshot.at);
    const row = list.current?.querySelector<HTMLElement>('[data-inspected="true"]');
    if (transferFocus) {
      const target = row?.querySelector<HTMLButtonElement>("[data-history-entry]")
        ?? tabs.current?.querySelector<HTMLButtonElement>('[data-state="active"]');
      target?.focus({ preventScroll: true });
    }
    if (!scrollRequested.current) return;
    scrollRequested.current = false;
    row?.scrollIntoView({ block: "nearest" });
  }, [snapshot, state.status, branch.id, arrived]);
  useLayoutEffect(() => {
    tabs.current?.querySelector<HTMLElement>('[data-state="active"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [branch.id]);
  if (!snapshot) return <IslandPanel title={i18n.formatMessage(historyMessages.history)}><p className="type-caption">{i18n.text(state.error ?? historyMessages.historyLoadingBody)}</p></IslandPanel>;
  const selected = entries.find(entry => entry.node.id === snapshot.at);
  const selectedVisible = snapshot.at === null ? showStart : visible.some(entry => entry.node.id === snapshot.at);
  const junction = (at: string | null) => <BranchNavigationRow
    parent={branch.forkId === at ? parent : undefined}
    branches={branchesByFork.get(at) ?? []}
    onNavigate={target => navigate(target, at, true)}
  />;
  return <Tabs value={branch.id} activationMode="manual" onValueChange={id => { const target = tree.branches.find(item => item.id === id); if (target) navigate(target); }} className="island-panel min-w-0 gap-0">
    <IslandPanel title={i18n.formatMessage(historyMessages.history)} compact contentRef={list} action={<ContinueAction controller={controller} />} toolbar={<>
      <div ref={tabs} className="overflow-x-auto pb-1"><TabsList variant="line" aria-label={i18n.formatMessage(historyMessages.historyBranches)}>
        {tree.branches.map(item => <TabsTrigger key={item.id} value={item.id}
          onClick={() => { if (item.id === branch.id && pending.current) navigate(item); }}
          title={item.id === executionBranch.id ? `${branchLabel(item)} · ${i18n.formatMessage(historyMessages.historyExecutionBranch)}` : branchLabel(item)}>
          {branchLabel(item)}{item.id === executionBranch.id && <CircleDot className="size-3" aria-label={i18n.formatMessage(historyMessages.historyExecutionBranch)} />}
        </TabsTrigger>)}
      </TabsList></div>
      <SearchInput value={query} onChange={setQuery} label={i18n.formatMessage(historyMessages.searchHistory)} />
      <div className="flex items-center gap-1">
        <HistoryViewPicker entries={entries} value={view} onChange={next => { setView(next); if (list.current) list.current.scrollTop = 0; }} />
      </div>
      <div className="flex items-center justify-between gap-2"><p className="type-caption min-w-0 truncate" title={selected?.label ?? i18n.formatMessage(historyMessages.historyStart)}>
        {state.status === "loading" ? i18n.formatMessage(historyMessages.historyLoadingBody) : historical ? snapshot.at === null ? i18n.formatMessage(historyMessages.historyStart) : i18n.formatMessage(commonMessages.viewingHistory) : i18n.formatMessage(commonMessages.live)}</p>
        {historical && <Button size="xs" variant="secondary" onClick={() => { scrollRequested.current = true; controller.followCursor(); }}>{i18n.formatMessage(commonMessages.backToLive)}</Button>}</div>
      {!selectedVisible && (search || view.kind !== "all") && <p className="type-caption">{i18n.formatMessage(historyMessages.historyFiltered)}</p>}
      {state.error && <p role="alert" className="type-caption">{i18n.text(state.error)}</p>}
    </>}>
      {tree.branches.map(item => <TabsContent key={item.id} value={item.id}>{item.id === branch.id && <>
        {showStart && <div data-inspected={snapshot.at === null}>
          <div className="flex items-center gap-0.5">
            <Button data-history-entry variant={snapshot.at === null ? "secondary" : "ghost"} aria-pressed={snapshot.at === null} className="min-w-0 flex-1 justify-start font-normal" onClick={() => inspect(null)}>
              <History className="size-4 text-muted-foreground" />{i18n.formatMessage(historyMessages.historyStart)}
              {snapshot.cursor === null && <CircleDot className="size-3" aria-label={i18n.formatMessage(historyMessages.historyExecutionPosition)} />}
              {snapshot.at === null && <Eye className="size-3" aria-label={i18n.formatMessage(commonMessages.viewingHistory)} />}
            </Button>
          </div>
          {junction(null)}
        </div>}
        {visible.map(entry => {
          const { node, resource } = entry;
          const descriptor = registry.resource(resource?.kind ?? "");
          const source = entry.scope === "session" ? `${i18n.formatMessage(historyMessages.sessionEvents)} · ${i18n.formatMessage(commonMessages.workbench)}` : `${i18n.text(descriptor.label)} · ${resource?.title ?? i18n.formatMessage(historyMessages.unknownResource)}`;
          const active = snapshot.at === node.id;
          return <div key={node.id} data-inspected={active}>
            <div className="flex items-center gap-0.5">
              <Button data-history-entry variant={active ? "secondary" : "ghost"} aria-pressed={active} className="h-auto min-w-0 flex-1 justify-start gap-3 px-2 py-1.5 text-left font-normal"
                title={`${i18n.text(entry.label)}\n${source}\n${i18n.formatDate(Date.parse(node.createdAt), { dateStyle: "medium", timeStyle: "short" })}`} onClick={() => inspect(node.id)}>
                <span className="shrink-0 text-muted-foreground" aria-hidden="true">{entry.scope === "session" ? <PanelsTopLeft className="size-4" /> : descriptor.icon}</span>
                <span className="min-w-0 flex-1"><span className="block truncate leading-5">{i18n.text(entry.label)}</span><span className="type-caption block truncate leading-4">{source}</span></span>
                {snapshot.cursor === node.id && <CircleDot className="size-3" aria-label={i18n.formatMessage(historyMessages.historyExecutionPosition)} />}
                {active && <Eye className="size-3" aria-label={i18n.formatMessage(commonMessages.viewingHistory)} />}
              </Button>
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={i18n.formatMessage(historyMessages.historyEntryActions)}><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => inspect(historyBefore(snapshot.nodes, node))}>{i18n.formatMessage(historyMessages.historyBefore)}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => inspect(node.id)}>{i18n.formatMessage(historyMessages.historyAfter)}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </div>
            {junction(node.id)}
          </div>;
        })}
        {!visible.length && !showStart && <p className="type-caption px-2 py-6 text-center">{i18n.formatMessage(commonMessages.noMatches)}</p>}
      </>}</TabsContent>)}
    </IslandPanel>
  </Tabs>;
}

/** 分叉点是事件之后的导航行；随所属事件筛选，不作为历史节点或事件操作。 */
function BranchNavigationRow({ parent, branches, onNavigate }: { parent?: HistoryBranch; branches: HistoryBranch[]; onNavigate: (branch: HistoryBranch) => void }) {
  const i18n = useI18n();
  if (!parent && branches.length === 0) return null;
  const singleBranch = branches.length === 1 ? branches[0] : undefined;
  return <div className="flex flex-wrap items-center gap-1 py-1 pl-9 pr-2">
    {parent && <Button variant="ghost" size="xs" title={i18n.formatMessage(historyMessages.historyBranchOrigin, { branch: branchLabel(parent) })} aria-label={i18n.formatMessage(historyMessages.historyBranchOrigin, { branch: branchLabel(parent) })} onClick={() => onNavigate(parent)}><ArrowUpLeft />{branchLabel(parent)}</Button>}
    {singleBranch && <Button variant="ghost" size="xs" title={i18n.formatMessage(historyMessages.historyBranchJump, { branch: branchLabel(singleBranch) })} aria-label={i18n.formatMessage(historyMessages.historyBranchJump, { branch: branchLabel(singleBranch) })} onClick={() => onNavigate(singleBranch)}>
      <GitBranch />{branchLabel(singleBranch)}
    </Button>}
    {branches.length > 1 && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="xs" aria-label={i18n.formatMessage(historyMessages.historyBranchChildren, { count: branches.length })}><GitBranch />{branches.length}<ChevronDown /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">{branches.map(child => <DropdownMenuItem key={child.id} onSelect={() => onNavigate(child)}><GitBranch />{branchLabel(child)}</DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu>}
  </div>;
}

function HistoryViewPicker({ entries, value, onChange }: { entries: HistoryEntry[]; value: HistoryView; onChange: (view: HistoryView) => void }) {
  const i18n = useI18n();
  const registry = useModuleViews();
  const [open, setOpen] = useState(false);
  const sources = useMemo(() => historyResourceViews(entries), [entries]);
  const presets = [
    { kind: "all" as const, label: i18n.formatMessage(historyMessages.historyAllRecords), icon: <History className="size-4" /> },
    { kind: "workbench" as const, label: i18n.formatMessage(historyMessages.historyWorkbenchEvents), icon: <PanelsTopLeft className="size-4" /> },
    { kind: "resources" as const, label: i18n.formatMessage(historyMessages.historyAllResourceEvents), icon: <Layers className="size-4" /> },
  ];
  const resource = value.kind === "resource" ? sources.find(source => source.resource.id === value.resourceId)?.resource : undefined;
  const preset = presets.find(item => item.kind === value.kind);
  const label = resource?.title ?? preset?.label ?? i18n.formatMessage(historyMessages.unknownResource);
  const icon = resource ? registry.resource(resource.kind).icon : preset?.icon;
  const choose = (view: HistoryView) => { onChange(view); setOpen(false); };
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
    <Button variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label={`${i18n.formatMessage(historyMessages.historyView)}: ${label}`} title={label} className="min-w-0 flex-1 justify-start">
      <span aria-hidden="true">{icon}</span><span className="min-w-0 flex-1 truncate text-left">{label}</span><ChevronDown />
    </Button></PopoverTrigger><PopoverContent align="start" className="w-80 p-0"><Command>
      <CommandInput placeholder={i18n.formatMessage(historyMessages.searchHistoryViews)} /><CommandList><CommandEmpty>{i18n.formatMessage(commonMessages.noMatches)}</CommandEmpty>
        <CommandGroup>{presets.map(item => <CommandItem key={item.kind} value={`view:${item.kind}`} keywords={[item.label]} onSelect={() => choose({ kind: item.kind })}>
          <span aria-hidden="true">{item.icon}</span><span className="flex-1">{item.label}</span>{value.kind === item.kind && <Check aria-hidden="true" />}
        </CommandItem>)}</CommandGroup>
        {sources.length > 0 && <><CommandSeparator /><CommandGroup heading={i18n.formatMessage(historyMessages.historySources)}>
          {sources.map(({ resource, count }) => { const descriptor = registry.resource(resource.kind); return <CommandItem key={resource.id} value={`resource:${resource.id}`} keywords={[resource.title, i18n.text(descriptor.label)]}
            onSelect={() => choose({ kind: "resource", resourceId: resource.id })}>
            <span aria-hidden="true">{descriptor.icon}</span><span className="min-w-0 flex-1"><span className="block truncate">{resource.title}</span><span className="type-caption block">{i18n.text(descriptor.label)}</span></span>
            <span className="type-caption tabular-nums">{count}</span>{value.kind === "resource" && value.resourceId === resource.id && <Check aria-hidden="true" />}
          </CommandItem>; })}
        </CommandGroup></>}
      </CommandList></Command></PopoverContent></Popover>;
}

/** 进度订阅只刷新继续操作，不使整份历史列表随流增量重渲染。 */
function ContinueAction({ controller }: { controller: SessionController }) {
  const i18n = useI18n();
  const { snapshot, state, historical } = useSession(controller);
  const progress = useSessionProgress(controller);
  const registry = useModuleViews();
  const [target, setTarget] = useState<{ id: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const resources = useMemo(() => historyResources(snapshot?.nodes ?? []), [snapshot?.nodes, i18n]);
  if (!snapshot) return null;
  const unsettled = progress.unsettledObjectIds.length > 0;
  const wait = i18n.formatMessage(historyMessages.waitForResources, { names: progress.unsettledObjectIds.map(id => resources.get(id)?.title ?? i18n.formatMessage(historyMessages.unknownResource)).join(", ") });
  const disabled = saving || unsettled || state.busy || state.status !== "ready";
  const actual = target?.id ? snap(snapshot.nodes, target.id) : null;
  const actualEntry = target ? historyEntries(snapshot.nodes, kind => i18n.text(registry.resource(kind).label)).find(entry => entry.node.id === actual) : undefined;
  return <><span title={unsettled ? wait : i18n.formatMessage(historyMessages.continueFromHere)}><Button size="xs" disabled={!historical || disabled} onClick={() => setTarget({ id: snapshot.at })}><GitBranch />{i18n.formatMessage(historyMessages.continueFromHere)}</Button></span>
    <AlertDialog open={target !== null} onOpenChange={open => { if (!open && !saving) setTarget(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{i18n.formatMessage(historyMessages.continueTitle)}</AlertDialogTitle><AlertDialogDescription>{i18n.formatMessage(historyMessages.continueDescription)}</AlertDialogDescription></AlertDialogHeader>
      {target && actual !== target.id && <p className="type-caption">{i18n.formatMessage(historyMessages.continueAdjusted)}</p>}
      <p className="type-body break-words">{actualEntry?.label ?? i18n.formatMessage(historyMessages.historyStart)}</p>
      {unsettled && <p className="type-caption">{wait}</p>}
      {state.error && <p className="type-caption" role="alert">{i18n.text(state.error)}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={saving}>{i18n.formatMessage(commonMessages.cancel)}</AlertDialogCancel><AlertDialogAction disabled={disabled} aria-busy={saving} onClick={event => {
        event.preventDefault(); if (!target) return; setSaving(true);
        void controller.branchFrom(target.id).then(result => { if (result.ok) setTarget(null); }).finally(() => setSaving(false));
      }}>{saving && <Spinner />}{i18n.formatMessage(historyMessages.continueConfirm)}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog></>;
}
