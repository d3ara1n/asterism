import { useCallback, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Cpu,
  Download,
  Filter,
  FolderKanban,
  Gauge,
  MoreHorizontal,
  SlidersHorizontal,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@asterism-app/ui/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@asterism-app/ui/ui/dropdown-menu";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Input } from "@asterism-app/ui/ui/input";
import { Label } from "@asterism-app/ui/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { cn } from "@asterism-app/ui/utils";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { formsMessages } from "@asterism-app/ui/messages/forms";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { toast } from "../../shared/toast";
import { useIsland } from "../../shared/weave/Screen";
import { dashboardMessages as msg } from "../../messages/dashboard";
import type { TelemetryDrilldownTarget } from "../../../shared/telemetry";
import {
  formatInteger,
  readMonthlyBudget,
  writeMonthlyBudget,
  type DashboardTab,
  type RangePreset,
} from "./format";
import { saveTextFile, useDashboardData, type DashboardFilterState } from "./use-dashboard";
import { OverviewTab } from "./OverviewTab";
import { ProjectsTab } from "./ProjectsTab";
import { ModelsTab } from "./ModelsTab";
import { ActivityTab } from "./ActivityTab";
import { ToolsTab } from "./ToolsTab";
import { DrilldownIsland } from "./DrilldownIsland";
import { FolderDotInline } from "./charts";

const ALL_VALUE = "__all__";
const UNGROUPED_VALUE = "__ungrouped__";
const DAY_MS = 86_400_000;

export function DashboardPage({
  active,
  onOpenSession,
}: {
  active: boolean;
  onOpenSession: (sessionId: string) => void;
}) {
  const i18n = useI18n();
  const island = useIsland();
  const {
    tab, setTab,
    range, setRange,
    filters, setFilters,
    filter,
    overview, projects, models, activity, tools,
    loading, error, refresh,
  } = useDashboardData(active);

  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(readMonthlyBudget);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const drilldownKeyRef = useRef<string | null>(null);

  const applyDrilldownAsFilter = useCallback((target: TelemetryDrilldownTarget) => {
    setFilters(prev => {
      if (target.kind === "folder") return { ...prev, folderId: target.folderId };
      if (target.kind === "model") return { ...prev, providerId: target.providerId, modelId: target.modelId };
      if (target.kind === "plugin") return { ...prev, pluginId: target.pluginId, purposeId: undefined };
      if (target.kind === "purpose") return { ...prev, pluginId: target.pluginId, purposeId: target.purposeId };
      return prev;
    });
  }, [setFilters]);

  const openDrilldown = useCallback((target: TelemetryDrilldownTarget) => {
    const key = `dashboard-drilldown:${JSON.stringify(target)}`;
    const previousKey = drilldownKeyRef.current;
    drilldownKeyRef.current = key;
    const label = target.kind === "day" ? target.date
      : target.kind === "model" ? target.modelId
      : target.kind === "folder" ? i18n.text(msg.drilldownFolder)
      : target.kind === "session" ? i18n.text(msg.drilldownSession)
      : target.kind === "purpose" ? i18n.text(msg.drilldownPurpose)
      : target.pluginId;
    const open = () => {
      void island.open({
        key,
        label,
        width: { min: 390, grow: 0.45, max: 520 },
        render: () => (
          <DrilldownIsland
            target={target}
            filter={filter}
            onApplyFilter={applyDrilldownAsFilter}
            onOpenSession={onOpenSession}
          />
        ),
      });
    };
    if (previousKey && previousKey !== key && island.has(previousKey)) {
      void island.closeOwned({ force: true }).then(open);
    } else {
      open();
    }
  }, [island, filter, i18n, applyDrilldownAsFilter, onOpenSession]);

  const handleExport = async (format: "csv" | "json") => {
    try {
      const res = await runtime.telemetry.execute({ type: "export", filter, format });
      if (!res.ok || res.reply.kind !== "export") {
        toast.error(i18n.text(msg.exportFailed));
        return;
      }
      const saved = await saveTextFile(res.reply.filename, res.reply.content);
      if (saved) toast.success(i18n.formatMessage(msg.exportedRows, { count: formatInteger(res.reply.rowCount) }));
    } catch {
      toast.error(i18n.text(msg.exportFailed));
    }
  };

  const handleSaveBudget = () => {
    const trimmed = budgetInput.trim();
    const parsed = trimmed ? Number(trimmed) : null;
    const next = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    writeMonthlyBudget(next);
    setMonthlyBudget(next);
    setBudgetOpen(false);
    toast.success(i18n.text(msg.budgetSaved));
  };

  const handleClear = async (beforeTimestamp: number | null) => {
    setClearing(true);
    try {
      const res = await runtime.telemetry.execute({ type: "clear", beforeTimestamp });
      if (res.ok && res.reply.kind === "clear") {
        const total = res.reply.deletedModelEvents + res.reply.deletedExternalEvents;
        toast.success(i18n.formatMessage(msg.clearDone, { count: formatInteger(total) }));
        setClearOpen(false);
        refresh();
      }
    } finally {
      setClearing(false);
    }
  };

  const hasFilters = filters.folderId !== undefined
    || filters.providerId !== undefined
    || filters.modelId !== undefined
    || filters.pluginId !== undefined
    || filters.purposeId !== undefined;

  const opts = overview?.filterOptions;
  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.folderId !== undefined) {
    const folderName = filters.folderId === null
      ? i18n.text(msg.ungrouped)
      : opts?.folders.find(f => f.id === filters.folderId)?.name ?? filters.folderId;
    activeFilterChips.push({
      key: "folder",
      label: `${i18n.text(msg.filterFolder)}: ${folderName}`,
      clear: () => setFilters(p => ({ ...p, folderId: undefined })),
    });
  }
  if (filters.providerId !== undefined) {
    const providerName = opts?.providers.find(p => p.id === filters.providerId)?.name ?? filters.providerId;
    activeFilterChips.push({
      key: "provider",
      label: `${i18n.text(msg.filterProvider)}: ${providerName}`,
      clear: () => setFilters(p => ({ ...p, providerId: undefined, modelId: undefined })),
    });
  }
  if (filters.modelId !== undefined) {
    activeFilterChips.push({
      key: "model",
      label: `${i18n.text(msg.filterModel)}: ${filters.modelId}`,
      clear: () => setFilters(p => ({ ...p, modelId: undefined })),
    });
  }
  if (filters.pluginId !== undefined) {
    const pOpt = opts?.plugins.find(p => p.id === filters.pluginId);
    const pluginLabel = pOpt?.name ? i18n.text(pOpt.name) : filters.pluginId;
    activeFilterChips.push({
      key: "plugin",
      label: `${i18n.text(msg.filterPlugin)}: ${pluginLabel}`,
      clear: () => setFilters(p => ({ ...p, pluginId: undefined, purposeId: undefined })),
    });
  }
  if (filters.purposeId !== undefined) {
    activeFilterChips.push({
      key: "purpose",
      label: filters.purposeId ?? i18n.text(msg.other),
      clear: () => setFilters(p => ({ ...p, purposeId: undefined })),
    });
  }

  const tabs: { id: DashboardTab; label: string; icon: typeof BarChart3 }[] = [
    { id: "overview", label: i18n.text(msg.tabOverview), icon: BarChart3 },
    { id: "projects", label: i18n.text(msg.tabProjects), icon: FolderKanban },
    { id: "models", label: i18n.text(msg.tabModels), icon: Cpu },
    { id: "activity", label: i18n.text(msg.tabActivity), icon: Activity },
    { id: "tools", label: i18n.text(msg.tabTools), icon: Wrench },
  ];

  const ranges: { id: RangePreset; label: string }[] = [
    { id: "today", label: i18n.text(msg.rangeToday) },
    { id: "7d", label: i18n.text(msg.range7d) },
    { id: "30d", label: i18n.text(msg.range30d) },
    { id: "90d", label: i18n.text(msg.range90d) },
    { id: "year", label: i18n.text(msg.rangeYear) },
    { id: "all", label: i18n.text(msg.rangeAll) },
  ];

  const isEmpty = overview !== null && !overview.hasAnyData;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background/60">
      {/* Sticky Control Header */}
      <header className="shrink-0 border-b border-border/70 bg-background/85 px-5 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3">
          {/* Perspective Tabs */}
          <nav className="flex flex-wrap items-center gap-1" aria-label={i18n.text(msg.title)}>
            {tabs.map(t => {
              const Icon = t.icon;
              const selected = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                    selected
                      ? "bg-selected text-selected-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Range, Filters, Options */}
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" size="sm" variant="outline" value={range} onValueChange={v => { if (v) setRange(v as RangePreset); }}>
              {ranges.map(r => (
                <ToggleGroupItem key={r.id} value={r.id} className="h-7 px-2 text-xs">{r.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>

            {/* Filter Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={hasFilters ? "selected" : "outline"} size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
                  <Filter className="size-3.5" />
                  <span>{i18n.text(msg.filter)}</span>
                  {activeFilterChips.length > 0 && (
                    <span className="rounded bg-foreground/15 px-1 text-[10px] tabular-nums">{activeFilterChips.length}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3">
                <FilterForm
                  filters={filters}
                  setFilters={setFilters}
                  options={opts}
                />
              </PopoverContent>
            </Popover>

            {/* More Options Menu */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <IconButton size="icon-xs" label={i18n.text(msg.moreActions)}>
                  <MoreHorizontal className="size-4" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => { setBudgetInput(monthlyBudget ? String(monthlyBudget) : ""); setBudgetOpen(true); }}>
                  <Gauge />{i18n.text(msg.budgetMenu)}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleExport("csv")} disabled={isEmpty}>
                  <Download />{i18n.text(msg.exportCsv)}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleExport("json")} disabled={isEmpty}>
                  <Download />{i18n.text(msg.exportJson)}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setClearOpen(true)} disabled={isEmpty}>
                  <Trash2 />{i18n.text(msg.clearDataMenu)}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Active filter chips row */}
        {activeFilterChips.length > 0 && (
          <div className="mx-auto mt-2 flex max-w-[1360px] flex-wrap items-center gap-1.5">
            {activeFilterChips.map(chip => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
              >
                <span>{chip.label}</span>
                <button type="button" onClick={chip.clear} className="rounded-sm p-0.5 hover:bg-accent" aria-label={i18n.text(commonMessages.close)}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setFilters({})}
              className="px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {i18n.text(msg.clearFilters)}
            </button>
          </div>
        )}
      </header>

      {/* Scrollable Dashboard Canvas */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-[1360px]">
          {error ? (
            <div className="surface flex flex-col items-center justify-center gap-3 rounded-xl py-16 text-center">
              <p className="text-sm text-muted-foreground">{i18n.text(msg.loadFailed)}</p>
              <Button variant="outline" size="sm" onClick={refresh}>{i18n.text(commonMessages.retry)}</Button>
            </div>
          ) : isEmpty ? (
            <div className="surface flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-20 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <BarChart3 className="size-6" />
              </div>
              <h2 className="type-section text-base font-medium text-foreground">{i18n.text(msg.emptyTitle)}</h2>
              <p className="max-w-md text-xs text-muted-foreground">{i18n.text(msg.emptyDescription)}</p>
            </div>
          ) : loading && !overview ? (
            <div className="flex h-64 items-center justify-center"><Spinner /></div>
          ) : (
            <div className={cn("transition-opacity duration-150", loading && "opacity-75")}>
              {tab === "overview" && overview && (
                <OverviewTab
                  data={overview}
                  monthlyBudget={monthlyBudget}
                  onDrilldown={openDrilldown}
                  onOpenSession={onOpenSession}
                />
              )}
              {tab === "projects" && projects && (
                <ProjectsTab
                  data={projects}
                  onDrilldown={openDrilldown}
                  onOpenSession={onOpenSession}
                />
              )}
              {tab === "models" && models && (
                <ModelsTab
                  data={models}
                  onDrilldown={openDrilldown}
                />
              )}
              {tab === "activity" && activity && (
                <ActivityTab
                  data={activity}
                  onDrilldown={openDrilldown}
                />
              )}
              {tab === "tools" && tools && (
                <ToolsTab
                  data={tools}
                  onDrilldown={openDrilldown}
                />
              )}

              {overview?.firstEventAt && (
                <footer className="mt-6 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {i18n.formatMessage(msg.recordingSince, {
                      date: new Date(overview.firstEventAt).toLocaleDateString(i18n.locale, { year: "numeric", month: "short", day: "numeric" }),
                    })}
                  </span>
                </footer>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Monthly Budget Dialog */}
      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{i18n.text(msg.budgetTitle)}</DialogTitle>
            <DialogDescription>{i18n.text(msg.budgetDescription)}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="dashboard-budget-input">{i18n.text(msg.budgetAmount)}</Label>
            <Input
              id="dashboard-budget-input"
              type="number"
              min="0"
              step="1"
              placeholder="50"
              value={budgetInput}
              onChange={e => setBudgetInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveBudget(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetOpen(false)}>{i18n.text(commonMessages.cancel)}</Button>
            <Button onClick={handleSaveBudget}>{i18n.text(formsMessages.save)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Data Dialog */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{i18n.text(msg.clearTitle)}</DialogTitle>
            <DialogDescription>{i18n.text(msg.clearDescription)}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button variant="outline" disabled={clearing} onClick={() => void handleClear(Date.now() - 90 * DAY_MS)}>
              {i18n.text(msg.clearOlder90)}
            </Button>
            <Button variant="outline" disabled={clearing} onClick={() => void handleClear(Date.now() - 30 * DAY_MS)}>
              {i18n.text(msg.clearOlder30)}
            </Button>
            <Button variant="destructive" disabled={clearing} onClick={() => void handleClear(null)}>
              {i18n.text(msg.clearAll)}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClearOpen(false)}>{i18n.text(commonMessages.cancel)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterForm({
  filters,
  setFilters,
  options,
}: {
  filters: DashboardFilterState;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilterState>>;
  options: {
    folders: { id: string; name: string; color: string | null; deleted: boolean }[];
    providers: { id: string; name: string }[];
    models: { providerId: string; modelId: string; providerName: string }[];
    plugins: { id: string; name: import("@asterism-app/sdk/contracts").UiText | null }[];
  } | undefined;
}) {
  const i18n = useI18n();
  const folderValue = filters.folderId === undefined ? ALL_VALUE : filters.folderId === null ? UNGROUPED_VALUE : filters.folderId;
  const availableModels = (options?.models ?? []).filter(m => !filters.providerId || m.providerId === filters.providerId);

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <SlidersHorizontal className="size-3.5" />
          {i18n.text(msg.filter)}
        </span>
        <button type="button" onClick={() => setFilters({})} className="text-[11px] text-muted-foreground hover:text-foreground">
          {i18n.text(msg.clearFilters)}
        </button>
      </div>

      {/* Folder */}
      <div className="flex flex-col gap-1">
        <Label className="text-[11px] text-muted-foreground">{i18n.text(msg.filterFolder)}</Label>
        <Select
          value={folderValue}
          onValueChange={v => setFilters(p => ({ ...p, folderId: v === ALL_VALUE ? undefined : v === UNGROUPED_VALUE ? null : v }))}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{i18n.text(msg.filterAll)}</SelectItem>
            <SelectItem value={UNGROUPED_VALUE}>{i18n.text(msg.ungrouped)}</SelectItem>
            {(options?.folders ?? []).map(f => (
              <SelectItem key={f.id} value={f.id}>
                <span className="flex items-center gap-1.5">
                  <FolderDotInline color={f.color} />
                  <span>{f.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Provider */}
      <div className="flex flex-col gap-1">
        <Label className="text-[11px] text-muted-foreground">{i18n.text(msg.filterProvider)}</Label>
        <Select
          value={filters.providerId ?? ALL_VALUE}
          onValueChange={v => setFilters(p => ({ ...p, providerId: v === ALL_VALUE ? undefined : v, modelId: undefined }))}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{i18n.text(msg.filterAll)}</SelectItem>
            {(options?.providers ?? []).map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model */}
      <div className="flex flex-col gap-1">
        <Label className="text-[11px] text-muted-foreground">{i18n.text(msg.filterModel)}</Label>
        <Select
          value={filters.modelId ?? ALL_VALUE}
          onValueChange={v => setFilters(p => ({ ...p, modelId: v === ALL_VALUE ? undefined : v }))}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{i18n.text(msg.filterAll)}</SelectItem>
            {availableModels.map(m => (
              <SelectItem key={`${m.providerId}::${m.modelId}`} value={m.modelId}>{m.modelId}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Plugin */}
      {(options?.plugins.length ?? 0) > 1 && (
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">{i18n.text(msg.filterPlugin)}</Label>
          <Select
            value={filters.pluginId ?? ALL_VALUE}
            onValueChange={v => setFilters(p => ({ ...p, pluginId: v === ALL_VALUE ? undefined : v, purposeId: undefined }))}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>{i18n.text(msg.filterAll)}</SelectItem>
              {(options?.plugins ?? []).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name ? i18n.text(p.name) : p.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
