import { useMemo } from "react";
import { Check, ListFilter, X } from "lucide-react";
import type { UiMessage } from "@asterism-app/sdk/contracts";
import { Button } from "@asterism-app/ui/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@asterism-app/ui/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { cn } from "@asterism-app/ui/utils";
import type { TelemetryFacets, TelemetryGroup } from "../../../shared/telemetry";
import { useI18n } from "../../shared/i18n";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { FolderDot } from "../folders/marks";
import { groupColor, groupDetail, groupLabel } from "./format";
import { groupFilter, type DashboardModel, type FilterDimensions, type FilterKey } from "./model";

interface FacetSection { id: string; label: UiMessage; groups: readonly TelemetryGroup[] }
/** Sessions outside every folder; the facet list holds only folders that exist or existed. */
const noFolder: TelemetryGroup = { dimension: "folder", key: JSON.stringify([null]), folderId: null, name: null, color: null, deleted: false };

/** True when every dimension the group selects matches the current filters. */
function matches(filters: FilterDimensions, group: TelemetryGroup): boolean {
  const narrowing = groupFilter(group);
  return !!narrowing && Object.entries(narrowing).every(([key, value]) => key in filters && filters[key as FilterKey] === value);
}

/** One searchable choice list across every facet; choosing a value toggles that filter. */
export function FilterPicker({ model, facets, filters }: { model: DashboardModel; facets: TelemetryFacets | null; filters: FilterDimensions }) {
  const i18n = useI18n();
  const sections = useMemo<FacetSection[]>(() => facets ? [
    { id: "folder", label: msg.filterFolder, groups: [noFolder, ...facets.folders] },
    { id: "provider", label: msg.filterProvider, groups: facets.providers },
    { id: "model", label: msg.filterModel, groups: facets.models },
    { id: "purpose", label: msg.filterPurpose, groups: facets.purposes },
    { id: "plugin", label: msg.filterPlugin, groups: facets.plugins.length > 1 ? facets.plugins : [] },
    { id: "thinking", label: msg.filterThinking, groups: facets.thinking },
  ].filter(section => section.groups.length > 0) : [], [facets]);
  const count = Object.keys(filters).length;
  return <Popover>
    <PopoverTrigger asChild>
      <Button variant={count ? "selected" : "ghost"} size="sm" aria-label={i18n.text(msg.filter)}>
        <ListFilter />{i18n.text(msg.filter)}{count > 0 && <span className="rounded bg-foreground/10 px-1 text-xs tabular-nums">{count}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 p-0" motionPreset="command">
      <Command>
        <CommandInput placeholder={i18n.text(msg.search)} />
        <CommandList className="max-h-80">
          <CommandEmpty>{i18n.text(msg.noMatches)}</CommandEmpty>
          {sections.map(section => <CommandGroup key={section.id} heading={i18n.text(section.label)}>
            {section.groups.map(group => {
              const active = matches(filters, group);
              const color = groupColor(group);
              const detail = groupDetail(group);
              return <CommandItem key={`${section.id}:${group.key}`} value={`${section.id}:${group.key}`} keywords={[groupLabel(i18n, group), detail ?? ""]}
                onSelect={() => {
                  const narrowing = groupFilter(group);
                  if (!narrowing) return;
                  if (active) for (const key of Object.keys(narrowing) as FilterKey[]) model.removeFilter(key);
                  else model.applyFilters(narrowing);
                }}>
                {color ? <FolderDot color={color} /> : <span className="size-2 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{groupLabel(i18n, group)}</span>
                {detail && <span className="type-caption max-w-24 truncate">{detail}</span>}
                <Check className={cn("size-4", !active && "invisible")} />
              </CommandItem>;
            })}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}

const chipLabels: Record<FilterKey, UiMessage> = {
  folderId: msg.filterFolder, providerId: msg.filterProvider, modelId: msg.filterModel, pluginId: msg.filterPlugin,
  purposeId: msg.filterPurpose, sessionId: msg.filterSession, thinking: msg.filterThinking,
};

/** Removable chips for active filters; a model chip stands for its provider too. */
export function FilterChips({ model, facets, filters, labels }: {
  model: DashboardModel; facets: TelemetryFacets | null; filters: FilterDimensions; labels: Partial<Record<FilterKey, string>>;
}) {
  const i18n = useI18n();
  const value = (key: FilterKey): string => {
    const find = (groups: readonly TelemetryGroup[] | undefined) => groups?.find(group => matches({ [key]: filters[key], ...(key === "modelId" ? { providerId: filters.providerId } : {}),
      ...(key === "purposeId" ? { pluginId: filters.pluginId } : {}) }, group));
    const group = key === "folderId" ? filters.folderId === null ? noFolder : find(facets?.folders)
      : key === "providerId" ? find(facets?.providers) : key === "modelId" ? find(facets?.models) : key === "pluginId" ? find(facets?.plugins)
      : key === "purposeId" ? find(facets?.purposes) : key === "thinking" ? find(facets?.thinking) : undefined;
    return group ? groupLabel(i18n, group) : labels[key] ?? String(filters[key] ?? i18n.text(msg.other));
  };
  const keys = (Object.keys(filters) as FilterKey[]).filter(key => !(key === "providerId" && filters.modelId !== undefined) && !(key === "pluginId" && filters.purposeId !== undefined));
  if (!keys.length) return null;
  return <div className="flex min-w-0 flex-wrap items-center gap-1.5">
    {keys.map(key => {
      const text = i18n.formatMessage(msg.filterChip, { dimension: i18n.text(chipLabels[key]), value: value(key) });
      return <span key={key} className="inline-flex h-7 max-w-64 items-center gap-1 rounded-md bg-secondary pr-0.5 pl-2 text-xs text-secondary-foreground">
        <span className="min-w-0 truncate">{text}</span>
        <button type="button" aria-label={i18n.formatMessage(msg.removeFilter, { name: text })} onClick={() => {
          model.removeFilter(key);
          if (key === "modelId") model.removeFilter("providerId");
          if (key === "purposeId") model.removeFilter("pluginId");
        }}
          className="flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-3" /></button>
      </span>;
    })}
    <Button variant="link" size="xs" onClick={() => model.clearFilters()}>{i18n.text(msg.clearFilters)}</Button>
  </div>;
}
