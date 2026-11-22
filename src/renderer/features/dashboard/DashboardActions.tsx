import { useId, useState } from "react";
import { Activity, BarChart3, Cpu, Download, Gauge, MoreHorizontal, PieChart, Wrench, Trash2 } from "lucide-react";
import type { UiMessage } from "@asterism-app/sdk/contracts";
import { useRendererApplication, useRendererSettings } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@asterism-app/ui/ui/dropdown-menu";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { cn } from "@asterism-app/ui/utils";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { toast } from "../../shared/toast";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { indicatorItem, SelectionIndicator } from "../../shared/selection-indicator";
import { ClearDialog } from "./ClearDialog";
import { FilterPicker } from "./Filters";
import { dashboardViews, useDashboard, usePageFilter, type DashboardModel, type DashboardView } from "./model";
import { rangePresets, type RangePreset } from "./range";

export const viewTabs: Record<DashboardView, { label: UiMessage; icon: typeof BarChart3 }> = {
  overview: { label: msg.viewOverview, icon: BarChart3 },
  attribution: { label: msg.viewAttribution, icon: PieChart },
  models: { label: msg.viewModels, icon: Cpu },
  activity: { label: msg.viewActivity, icon: Activity },
  tools: { label: msg.viewTools, icon: Wrench },
};
const rangeLabels: Record<RangePreset, UiMessage> = { today: msg.rangeToday, "7d": msg.range7d, "30d": msg.range30d, "90d": msg.range90d, "365d": msg.range365d, all: msg.rangeAll };

/**
 * Window titlebar actions of the usage page, like the workbench's: the view switch and the source of every panel and detail island
 * below it (range and filters), followed by page operations.
 */
export function DashboardActions({ model }: { model: DashboardModel }) {
  const i18n = useI18n();
  const state = useDashboard(model);
  const page = usePageFilter(state);
  const application = useRendererApplication();
  const settings = useRendererSettings();
  const [clearing, setClearing] = useState(false);
  const indicator = useId();
  const empty = state.facets?.firstEventAt === null;
  const exportAs = async (format: "csv" | "json") => {
    try {
      const result = await runtime.telemetry.execute({ type: "export", filter: page.filter, format });
      if (!result.ok || result.reply.kind !== "export") { toast.error(i18n.text(msg.exportFailed)); return; }
      const { filename, content, rows } = result.reply;
      if (await application.files.save(filename, (async function* () { yield new TextEncoder().encode(content); })()))
        toast.success(i18n.formatMessage(msg.exported, { count: rows }));
    } catch { toast.error(i18n.text(msg.exportFailed)); }
  };
  return <>
    <div role="group" aria-label={i18n.text(msg.views)} className="flex items-center gap-0.5">
      {dashboardViews.map(view => {
        const { label, icon: Icon } = viewTabs[view];
        const selected = state.view === view;
        return <span key={view} className="relative">
          {selected && <SelectionIndicator layoutId={indicator} />}
          <Button variant="ghost" size="sm" className={indicatorItem(selected)} aria-pressed={selected} aria-label={i18n.text(label)}
            onClick={() => model.setView(view)}><Icon /><span className="toolbar-label">{i18n.text(label)}</span></Button>
        </span>;
      })}
    </div>
    <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
    <span className={cn("flex w-5 justify-center transition-opacity", state.pending ? "opacity-100" : "opacity-0")} role="status"
      aria-label={state.pending ? i18n.text(msg.refreshing) : undefined}><Spinner className="size-3.5 text-muted-foreground" /></span>
    <Select value={state.range} onValueChange={value => model.setRange(value as RangePreset)}>
      <SelectTrigger size="sm" className="h-8 w-28 border-0 bg-transparent shadow-none dark:bg-transparent" aria-label={i18n.text(msg.range)}><SelectValue /></SelectTrigger>
      <SelectContent align="end">{rangePresets.map(range => <SelectItem key={range} value={range}>{i18n.text(rangeLabels[range])}</SelectItem>)}</SelectContent>
    </Select>
    <FilterPicker model={model} facets={state.facets} filters={state.filters} />
    <DropdownMenu modal={false}>
      <IconButton label={i18n.text(msg.more)} asChild><DropdownMenuTrigger><MoreHorizontal /></DropdownMenuTrigger></IconButton>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={empty} onSelect={() => void exportAs("csv")}><Download />{i18n.text(msg.exportCsv)}</DropdownMenuItem>
        <DropdownMenuItem disabled={empty} onSelect={() => void exportAs("json")}><Download />{i18n.text(msg.exportJson)}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => settings.openHost("general")}><Gauge />{i18n.text(msg.budgetSettings)}</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" disabled={empty} onSelect={() => setClearing(true)}><Trash2 />{i18n.text(msg.clearData)}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <ClearDialog open={clearing} onOpenChange={setClearing} />
  </>;
}
