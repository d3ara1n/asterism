import { CircleDot, History, PanelsTopLeft, MoreHorizontal, ArrowUpLeft, GitBranch, ChevronDown, Layers, Check } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { commonMessages } from "@asterism/ui/messages/common";
import { historyMessages } from "../../messages/history";
import { useModuleViews } from "../../modules/views";
import { getI18n, useI18n } from "../../shared/i18n";
import { operationSucceeded } from "../../shared/toast";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@asterism/ui/ui/alert-dialog";
import { Button } from "@asterism/ui/ui/button";
import { ListRow, ListRowAction } from "@asterism/ui/ui/list-row";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@asterism/ui/ui/command";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@asterism/ui/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@asterism/ui/ui/popover";
import { SearchInput } from "@asterism/ui/ui/search-input";
import { Spinner } from "@asterism/ui/ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@asterism/ui/ui/tabs";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import type { SessionController } from "./controller";
import { branchContains, historyBranches, branchForNode, type HistoryBranch } from "./history-branches";
import { historyBefore, historyEntries, historyResources, historyResourceViews, matchesHistoryView, type HistoryView, type HistoryEntry } from "./history-navigation";
import { useSession, useSessionActivity } from "./state";
import { useDisposalWarnings } from "./disposal";
import { sessionTimeline } from "../../../shared/session-timeline";
import { foldWorkbench } from "../../../session/fold";

const branchLabel = (branch: HistoryBranch) => branch.number === 0 ? getI18n().formatMessage(historyMessages.historyMainBranch) : getI18n().formatMessage(historyMessages.historyBranch, { number: branch.number });

/** 历史逐节点导航；正文阅读与 response 聚合属于代理卡片。 */
export function SessionHistoryPanel({ controller }: { controller: SessionController }) {
  const i18n = useI18n();
  const { snapshot, state } = useSession(controller);
  const registry = useModuleViews();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<HistoryView>({ kind: "all" });
  const [selection, setSelection] = useState<{ branchId: string; nodeId: string | null } | null>(null);
  const focusOrigin = useRef<Element | null>(null);
  const remembered = useRef(new Map<string, string | null>());
  const list = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const scrollRequested = useRef(true);
  const entries = useMemo(() => snapshot ? historyEntries(snapshot.nodes, registry) : [], [snapshot?.nodes, registry, i18n]);
  const tree = useMemo(() => historyBranches(snapshot?.nodes ?? []), [snapshot?.nodes]);
  const selectedId = selection ? selection.nodeId : snapshot?.cursor ?? null;
  const branch = branchForNode(tree, selectedId, selection?.branchId);
  const executionBranch = branchForNode(tree, snapshot?.cursor ?? null);
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
    && (!search || `${entry.label} ${entry.resource?.title ?? i18n.formatMessage(commonMessages.workbench)} ${entry.resource ? i18n.text(registry.resource(entry.resource.kind).label) : ""}`.toLocaleLowerCase(i18n.locale).includes(search)));
  const showStart = branch.forkId === null && !search && view.kind === "all";
  const navigate = (target: HistoryBranch, requestedId?: string | null, reveal = false) => {
    const last = remembered.current.get(target.id);
    const nodeId = requestedId !== undefined ? requestedId : last !== undefined && branchContains(target, last) ? last : target.tip;
    if (reveal) { setQuery(""); setView({ kind: "all" }); }
    focusOrigin.current = requestedId !== undefined ? document.activeElement : null;
    scrollRequested.current = true;
    setSelection({ branchId: target.id, nodeId });
    remembered.current.set(target.id, nodeId);
  };
  const selectEntry = (nodeId: string | null) => navigate(branchForNode(tree, nodeId, branch.id), nodeId);
  useLayoutEffect(() => {
    // 切换 Tab 后承接原条目焦点，不夺取搜索等控件的焦点。
    const transferFocus = focusOrigin.current && (document.activeElement === focusOrigin.current
      || document.activeElement === document.body || list.current?.contains(document.activeElement));
    focusOrigin.current = null;
    if (!snapshot) return;
    const row = list.current?.querySelector<HTMLElement>('[data-selected="true"]');
    if (transferFocus) {
      const target = row?.querySelector<HTMLButtonElement>('[data-slot="list-row-open"]')
        ?? tabs.current?.querySelector<HTMLButtonElement>('[data-state="active"]');
      target?.focus({ preventScroll: true });
    }
    if (!scrollRequested.current) return;
    scrollRequested.current = false;
    row?.scrollIntoView({ block: "nearest" });
  }, [snapshot, branch.id, selectedId]);
  useLayoutEffect(() => {
    tabs.current?.querySelector<HTMLElement>('[data-state="active"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [branch.id]);
  if (!snapshot) return <IslandPanel title={i18n.formatMessage(historyMessages.history)}><p className="type-caption">{i18n.text(state.readError ?? historyMessages.historyLoadingBody)}</p></IslandPanel>;
  const selected = entries.find(entry => entry.node.id === selectedId);
  const selectedVisible = selectedId === null ? showStart : visible.some(entry => entry.node.id === selectedId);
  const junction = (nodeId: string | null) => <BranchNavigationRow
    parent={branch.forkId === nodeId ? parent : undefined}
    branches={branchesByFork.get(nodeId) ?? []}
    onNavigate={target => navigate(target, nodeId, true)}
  />;
  return <Tabs value={branch.id} activationMode="manual" onValueChange={id => { const target = tree.branches.find(item => item.id === id); if (target) navigate(target); }} className="island-panel min-w-0 gap-0">
    <IslandPanel title={i18n.formatMessage(historyMessages.history)} compact contentRef={list} action={<ContinueAction controller={controller} nodeId={selectedId} />} toolbar={<>
      <div ref={tabs} className="overflow-x-auto pb-1"><TabsList variant="line" aria-label={i18n.formatMessage(historyMessages.historyBranches)}>
        {tree.branches.map(item => <TabsTrigger key={item.id} value={item.id}
          title={item.id === executionBranch.id ? `${branchLabel(item)} · ${i18n.formatMessage(historyMessages.historyExecutionBranch)}` : branchLabel(item)}>
          {branchLabel(item)}{item.id === executionBranch.id && <CircleDot className="size-3" aria-label={i18n.formatMessage(historyMessages.historyExecutionBranch)} />}
        </TabsTrigger>)}
      </TabsList></div>
      <SearchInput value={query} onChange={setQuery} label={i18n.formatMessage(historyMessages.searchHistory)} />
      <div className="flex items-center gap-1">
        <HistoryViewPicker entries={entries} value={view} onChange={next => { setView(next); if (list.current) list.current.scrollTop = 0; }} />
      </div>
      <div className="flex items-center justify-between gap-2"><p className="type-caption min-w-0 truncate" title={selected?.label ?? i18n.formatMessage(historyMessages.historyStart)}>
        {selected?.label ?? i18n.formatMessage(historyMessages.historyStart)}</p></div>
      {!selectedVisible && (search || view.kind !== "all") && <p className="type-caption">{i18n.formatMessage(historyMessages.historyFiltered)}</p>}
    </>}>
      {tree.branches.map(item => <TabsContent key={item.id} value={item.id}>{item.id === branch.id && <>
        {showStart && <div data-selected={selectedId === null}>
          <ListRow variant="navigation" selected={selectedId === null} className="font-normal"
            buttonProps={{ "aria-pressed": selectedId === null, "aria-current": undefined }} onOpen={() => selectEntry(null)}
            media={<History className="size-4 text-muted-foreground" />}
            title={<span className="flex min-w-0 items-center gap-2"><span className="truncate">{i18n.formatMessage(historyMessages.historyStart)}</span>
              {snapshot.cursor === null && <CircleDot className="size-3 shrink-0" aria-label={i18n.formatMessage(historyMessages.historyExecutionPosition)} />}
            </span>} />
          {junction(null)}
        </div>}
        {visible.map(entry => {
          const { node, resource } = entry;
          const descriptor = registry.resource(resource?.kind ?? "");
          const source = entry.scope === "session" ? i18n.formatMessage(historyMessages.sessionEvents) : `${i18n.text(descriptor.label)} · ${resource?.title ?? i18n.formatMessage(historyMessages.unknownResource)}`;
          const active = selectedId === node.id;
          return <div key={node.id} data-selected={active}>
            <ListRow variant="navigation" selected={active} className="h-auto px-2 py-1.5 font-normal" onOpen={() => selectEntry(node.id)}
              buttonProps={{ "aria-pressed": active, "aria-current": undefined,
                title: `${entry.label}\n${source}\n${i18n.formatDate(Date.parse(node.createdAt), { dateStyle: "medium", timeStyle: "short" })}` }}
              media={<span className="text-muted-foreground" aria-hidden="true">{entry.icon ?? (entry.scope === "session" ? <PanelsTopLeft className="size-4" /> : descriptor.icon)}</span>}
              title={<span className="flex min-w-0 items-center gap-3">
                <span className="min-w-0 flex-1">{entry.row?.(entry.label) ?? <span className="block truncate leading-5">{entry.label}</span>}<span className="type-caption block truncate leading-4">{source}</span></span>
                {snapshot.cursor === node.id && <CircleDot className="size-3 shrink-0" aria-label={i18n.formatMessage(historyMessages.historyExecutionPosition)} />}
              </span>}
              actions={<DropdownMenu><DropdownMenuTrigger asChild><ListRowAction
                aria-label={i18n.formatMessage(historyMessages.historyEntryActions)}><MoreHorizontal /></ListRowAction></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => selectEntry(historyBefore(snapshot.nodes, node))}>{i18n.formatMessage(historyMessages.historyBefore)}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => selectEntry(node.id)}>{i18n.formatMessage(historyMessages.historyAfter)}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>} />
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
    { kind: "session" as const, label: i18n.formatMessage(historyMessages.historySessionEvents), icon: <PanelsTopLeft className="size-4" /> },
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
function ContinueAction({ controller, nodeId }: { controller: SessionController; nodeId: string | null }) {
  const i18n = useI18n();
  const { snapshot, state } = useSession(controller);
  const progress = useSessionActivity(controller);
  const registry = useModuleViews();
  const [target, setTarget] = useState<{ id: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const resources = useMemo(() => historyResources(snapshot?.nodes ?? []), [snapshot?.nodes, i18n]);
  // 回溯将移出当前集合的对象；确认框打开时才计算并查询其结束提示。
  const leaving = useMemo(() => {
    if (!target || !snapshot) return null;
    const retained = new Set(foldWorkbench(sessionTimeline(snapshot.nodes, target.id)).objects.map(object => object.id));
    return snapshot.workbench.objects.filter(object => !retained.has(object.id)).map(object => object.id);
  }, [target, snapshot?.nodes, snapshot?.workbench.objects]);
  const warnings = useDisposalWarnings(controller.sessionId, leaving);
  if (!snapshot) return null;
  const unsettled = progress.timelineBusy || progress.busyObjectIds.length > 0;
  const wait = i18n.formatMessage(historyMessages.waitForResources, { names: progress.busyObjectIds.map(id => resources.get(id)?.title ?? i18n.formatMessage(historyMessages.unknownResource)).join(", ") });
  const disabled = saving || unsettled || state.navigating || state.status !== "ready";
  const actual = target?.id ?? null;
  const actualEntry = target ? historyEntries(snapshot.nodes, registry).find(entry => entry.node.id === actual) : undefined;
  return <><span title={unsettled ? wait : i18n.formatMessage(historyMessages.continueFromHere)}><Button size="xs" disabled={nodeId === snapshot.cursor || disabled} onClick={() => setTarget({ id: nodeId })}><GitBranch />{i18n.formatMessage(historyMessages.continueFromHere)}</Button></span>
    <AlertDialog open={target !== null} onOpenChange={open => { if (!open && !saving) setTarget(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{i18n.formatMessage(historyMessages.continueTitle)}</AlertDialogTitle><AlertDialogDescription>{i18n.formatMessage(historyMessages.continueDescription)}</AlertDialogDescription></AlertDialogHeader>
      <p className="type-body break-words">{actualEntry?.label ?? i18n.formatMessage(historyMessages.historyStart)}</p>
      {warnings.map(item => <p key={item.objectId} className="type-body break-words text-destructive">{item.title}: {i18n.text(item.warning)}</p>)}
      {unsettled && <p className="type-caption">{wait}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={saving}>{i18n.formatMessage(commonMessages.cancel)}</AlertDialogCancel><AlertDialogAction disabled={disabled} aria-busy={saving} onClick={event => {
        event.preventDefault(); if (!target) return; setSaving(true);
        void controller.branchFrom(target.id).then(result => { if (operationSucceeded(result)) setTarget(null); }).finally(() => setSaving(false));
      }}>{saving && <Spinner />}{i18n.formatMessage(historyMessages.continueConfirm)}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog></>;
}
