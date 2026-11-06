import { CircleDot, History, PanelsTopLeft, MoreHorizontal, ArrowUpLeft, GitBranch, ChevronDown, Layers, Check } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { commonMessages } from "@asterism-app/ui/messages/common";
import { historyMessages } from "../../messages/history";
import { useModuleViews } from "../../modules/views";
import { getI18n, useI18n } from "../../shared/i18n";
import { operationSucceeded } from "../../shared/toast";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@asterism-app/ui/ui/alert-dialog";
import { Button } from "@asterism-app/ui/ui/button";
import { ListRow, ListRowAction } from "@asterism-app/ui/ui/list-row";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@asterism-app/ui/ui/command";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@asterism-app/ui/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@asterism-app/ui/ui/popover";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@asterism-app/ui/ui/tabs";
import { Panel } from "../../shared/weave/Panel";
import type { SessionController } from "./controller";
import { branchContains, historyBranches, branchForNode, type HistoryBranch } from "./history-branches";
import { historyResourceViews, matchesHistoryView, historyEntry, type HistoryDirectory, type HistoryView, type HistoryEntry } from "./history-navigation";
import { useSession, useSessionActivity } from "./state";
import { useDisposalWarnings } from "./disposal";
import { sessionTimeline } from "../../../shared/session-timeline";
import { foldWorkbench, workbenchRecordIds } from "../../../session/fold";

import { Virtualizer, type VirtualizerHandle } from "virtua";
import type { ReactNode } from "react";
import { useSessionRead, type RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import type { SessionNodeInfo } from "../../../shared/session";
import { readHistoryDirectory, useHistoryEntry, useHistorySearch } from "./history-reader";
import { recordNode } from "../../../plugins/records";

const branchLabel = (branch: HistoryBranch) => branch.number === 0 ? getI18n().formatMessage(historyMessages.historyMainBranch) : getI18n().formatMessage(historyMessages.historyBranch, { number: branch.number });

/** History navigates node by node; body reading and response aggregation belong to the agent card. */
export function SessionHistoryPanel({ controller, onClose }: { controller: SessionController; onClose: () => void }) {
  const i18n = useI18n();
  const { snapshot, state } = useSession(controller);
  const registry = useModuleViews();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<HistoryView>({ kind: "all" });
  const [selection, setSelection] = useState<{ branchId: string; nodeId: string | null } | null>(null);
  const remembered = useRef(new Map<string, string | null>());
  const list = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const scrollRequested = useRef(true);
  const remote = controller.recordSnapshot();
  const directory = useSessionRead(remote, readHistoryDirectory, { keepPrevious: true });
  const entries = useMemo(() => snapshot && directory.data ? snapshot.nodes.map(info => historyEntry(info, null, directory.data!, registry)) : [], [snapshot?.nodes, directory.data, registry, i18n]);
  const virtual = useRef<VirtualizerHandle>(null);
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
  const candidates = useMemo(() => {
    const eligible = new Set(entries.filter(entry => matchesHistoryView(entry, view)).map(entry => entry.node.id));
    return snapshot?.nodes.filter(node => branch.nodeIds.has(node.id) && eligible.has(node.id)) ?? [];
  }, [snapshot?.nodes, entries, branch, view]);
  const matches = useHistorySearch(remote, candidates, directory.data, registry, search);
  const visible = search ? candidates.filter(node => matches.ids.has(node.id)) : candidates;
  const selectedRead = useHistoryEntry(remote, snapshot?.nodes.find(node => node.id === selectedId), directory.data, registry);
  const showStart = branch.forkId === null && !search && view.kind === "all";
  const navigate = (target: HistoryBranch, requestedId?: string | null, reveal = false) => {
    const last = remembered.current.get(target.id);
    const nodeId = requestedId !== undefined ? requestedId : last !== undefined && branchContains(target, last) ? last : target.tip;
    if (reveal) { setQuery(""); setView({ kind: "all" }); }
    scrollRequested.current = true;
    setSelection({ branchId: target.id, nodeId });
    remembered.current.set(target.id, nodeId);
  };
  const selectEntry = (nodeId: string | null) => navigate(branchForNode(tree, nodeId, branch.id), nodeId);
  useLayoutEffect(() => {
    if (!scrollRequested.current) return;
    const index = visible.findIndex(node => node.id === selectedId);
    if (index < 0) return;
    virtual.current?.scrollToIndex(index, { align: "nearest" });
    scrollRequested.current = false;
  }, [visible, selectedId]);
  useLayoutEffect(() => {
    tabs.current?.querySelector<HTMLElement>('[data-state="active"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [branch.id]);
  if (!snapshot) return <Panel onClose={onClose} title={i18n.formatMessage(historyMessages.history)}><p className="type-caption">{i18n.text(state.readError ?? historyMessages.historyLoadingBody)}</p></Panel>;
  const selected = selectedRead.data;
  const selectedLabel = selected?.label ?? i18n.text(selectedId === null ? historyMessages.historyStart
    : selectedRead.error ? historyMessages.readFailed : commonMessages.loading);
  const selectedVisible = selectedId === null ? showStart : visible.some(node => node.id === selectedId);
  const junction = (nodeId: string | null) => <BranchNavigationRow
    parent={branch.forkId === nodeId ? parent : undefined}
    branches={branchesByFork.get(nodeId) ?? []}
    onNavigate={target => navigate(target, nodeId, true)}
  />;
  return <Tabs value={branch.id} activationMode="manual" onValueChange={id => { const target = tree.branches.find(item => item.id === id); if (target) navigate(target); }} className="island-panel min-w-0 gap-0">
    <Panel onClose={onClose} title={i18n.formatMessage(historyMessages.history)} compact contentRef={list} action={<ContinueAction controller={controller} nodeId={selectedId} directory={directory.data} label={selectedLabel} />} toolbar={<>
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
      <div className="flex items-center justify-between gap-2"><p className="type-caption min-w-0 truncate" title={selectedLabel}>
        {selectedLabel}</p></div>
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
        {directory.status === "loading" && !directory.data && <p className="type-caption p-2">{i18n.text(commonMessages.loading)}</p>}
        {directory.error && <p className="type-caption p-2">{i18n.text(historyMessages.readFailed)} <Button variant="ghost" size="xs" onClick={directory.retry}>{i18n.text(commonMessages.retry)}</Button></p>}
        {matches.pending && <p className="type-caption p-2" role="status">{i18n.text(historyMessages.searching)}</p>}
        {matches.failed && <p className="type-caption p-2">{i18n.text(historyMessages.readFailed)} <Button variant="ghost" size="xs" onClick={matches.retry}>{i18n.text(commonMessages.retry)}</Button></p>}
        <Virtualizer ref={virtual} data={visible} scrollRef={list}>
          {info => <HistoryRecordRow key={info.id} info={info} snapshot={remote} directory={directory.data}
            selected={selectedId === info.id} current={snapshot.cursor === info.id} select={selectEntry} junction={junction(info.id)} />}
        </Virtualizer>
        {!visible.length && !showStart && !matches.pending && !matches.failed && directory.status === "ready" && <p className="type-caption px-2 py-6 text-center">{i18n.formatMessage(commonMessages.noMatches)}</p>}
      </>}</TabsContent>)}
    </Panel>
  </Tabs>;
}

function HistoryRecordRow({ info, snapshot, directory, selected, current, select, junction }: {
  info: SessionNodeInfo; snapshot: RendererSessionSnapshot | null; directory: HistoryDirectory | null;
  selected: boolean; current: boolean; select(id: string | null): void; junction: ReactNode;
}) {
  const i18n = useI18n(), registry = useModuleViews();
  const read = useHistoryEntry(snapshot, info, directory, registry);
  const entry = read.data;
  const descriptor = registry.resource(entry?.resource?.kind ?? info.source?.resource?.kind ?? "");
  const source = info.source?.resource
    ? `${i18n.text(descriptor.label)} · ${entry?.resource?.title ?? directory?.resources.get(info.source.resource.id)?.title ?? i18n.text(historyMessages.unknownResource)}`
    : i18n.text(historyMessages.sessionEvents);
  const label = entry?.label ?? i18n.text(read.error ? historyMessages.readFailed : commonMessages.loading);
  return <div data-selected={selected}>
    <ListRow variant="navigation" selected={selected} className="h-auto px-2 py-1.5 font-normal" onOpen={() => select(info.id)}
      buttonProps={{ "aria-pressed": selected, "aria-current": undefined,
        title: `${label}\n${source}\n${i18n.formatDate(Date.parse(info.createdAt), { dateStyle: "medium", timeStyle: "short" })}` }}
      media={<span className="text-muted-foreground" aria-hidden="true">{entry?.icon ?? (info.source?.resource ? descriptor.icon : <PanelsTopLeft />)}</span>}
      title={<span className="flex min-w-0 items-center gap-3">
        <span className="min-w-0 flex-1">{entry?.row?.(label) ?? <span className="block truncate leading-5">{label}</span>}
          <span className="type-caption block truncate leading-4">{source}</span></span>
        {current && <CircleDot className="size-3 shrink-0" aria-label={i18n.text(historyMessages.historyExecutionPosition)} />}
      </span>}
      actions={read.error ? <Button variant="ghost" size="xs" onClick={read.retry}>{i18n.text(commonMessages.retry)}</Button>
        : <DropdownMenu><DropdownMenuTrigger asChild><ListRowAction aria-label={i18n.text(historyMessages.historyEntryActions)}><MoreHorizontal /></ListRowAction></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => select(info.parentId)}>{i18n.text(historyMessages.historyBefore)}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => select(info.id)}>{i18n.text(historyMessages.historyAfter)}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>} />
    {junction}
  </div>;
}

/** A branch point is a navigation row after an event; it is filtered with its event and is neither a historical node nor an event action. */
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

/** Progress subscriptions refresh only the continue action, preventing the entire history list from rerendering on stream deltas. */
function ContinueAction({ controller, nodeId, directory, label }: { controller: SessionController; nodeId: string | null; directory: HistoryDirectory | null; label?: string }) {
  const i18n = useI18n();
  const { snapshot, state } = useSession(controller);
  const progress = useSessionActivity(controller);
  const [target, setTarget] = useState<{ id: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const resources = directory?.resources;
  const remote = controller.recordSnapshot();
  // Rewinding will move objects out of the current set; compute them and query their disposal notices only when the confirmation dialog opens.
  const leaving = useSessionRead(remote, useCallback(async (remote, signal) => {
    if (!target || !snapshot) return null;
    const path = sessionTimeline(snapshot.nodes, target.id);
    const records = await remote.records.all({ scope: "session", ids: path.map(node => node.id), contracts: workbenchRecordIds }, { signal });
    const retained = new Set(foldWorkbench(records.map(recordNode)).objects.map(object => object.id));
    return snapshot.workbench.objects.filter(object => !retained.has(object.id)).map(object => object.id);
  }, [target, snapshot?.nodes, snapshot?.workbench.objects]));
  const warnings = useDisposalWarnings(controller.sessionId, leaving.data);
  if (!snapshot) return null;
  const unsettled = progress.timelineBusy || progress.busyObjectIds.length > 0;
  const wait = i18n.formatMessage(historyMessages.waitForResources, { names: progress.busyObjectIds.map(id => resources?.get(id)?.title ?? i18n.formatMessage(historyMessages.unknownResource)).join(", ") });
  const disabled = saving || unsettled || state.navigating || state.status !== "ready" || (target !== null && leaving.status !== "ready");
  return <><span title={unsettled ? wait : i18n.formatMessage(historyMessages.continueFromHere)}><Button size="xs" disabled={nodeId === snapshot.cursor || disabled} onClick={() => setTarget({ id: nodeId })}><GitBranch />{i18n.formatMessage(historyMessages.continueFromHere)}</Button></span>
    <AlertDialog open={target !== null} onOpenChange={open => { if (!open && !saving) setTarget(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{i18n.formatMessage(historyMessages.continueTitle)}</AlertDialogTitle><AlertDialogDescription>{i18n.formatMessage(historyMessages.continueDescription)}</AlertDialogDescription></AlertDialogHeader>
      <p className="type-body break-words">{label ?? i18n.formatMessage(historyMessages.historyStart)}</p>
      {leaving.error && <p className="type-caption text-destructive">{i18n.text(historyMessages.readFailed)} <Button variant="ghost" size="xs" onClick={leaving.retry}>{i18n.text(commonMessages.retry)}</Button></p>}
      {warnings.map(item => <p key={item.objectId} className="type-body break-words text-destructive">{item.title}: {i18n.text(item.warning)}</p>)}
      {unsettled && <p className="type-caption">{wait}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={saving}>{i18n.formatMessage(commonMessages.cancel)}</AlertDialogCancel><AlertDialogAction disabled={disabled} aria-busy={saving} onClick={event => {
        event.preventDefault(); if (!target) return; setSaving(true);
        void controller.branchFrom(target.id).then(result => { if (operationSucceeded(result)) setTarget(null); }).finally(() => setSaving(false));
      }}>{saving && <Spinner />}{i18n.formatMessage(historyMessages.continueConfirm)}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog></>;
}
