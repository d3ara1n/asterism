import { useMemo } from "react";
import { Check, ListFilter, X } from "lucide-react";
import type { UiMessage } from "@asterism-app/sdk/contracts";
import { Button } from "@asterism-app/ui/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@asterism-app/ui/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { cn } from "@asterism-app/ui/utils";
import type { ModelKind, TelemetryFacets, TelemetryGroup } from "../../../shared/telemetry";
import { useI18n } from "../../shared/i18n";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { FolderDot } from "../folders/marks";
import { groupColor, groupLabel } from "./format";
import type { DashboardModel, FilterDimensions, FilterKey } from "./model";

type I18n = ReturnType<typeof useI18n>;
type ModelGroup = Extract<TelemetryGroup, { dimension: "model" }>;

/** One selectable value: the dimensions it sets, and how it reads in the choice list and in the applied filters. */
interface Choice { id: string; label: string; detail: string | null; color: ReturnType<typeof groupColor>; keywords: readonly string[]; narrowing: FilterDimensions }
interface FacetSection { id: string; label: UiMessage; choices: readonly Choice[] }

/** True when every dimension the narrowing selects already matches the filters. */
function matches(filters: FilterDimensions, narrowing: FilterDimensions): boolean {
  return Object.entries(narrowing).every(([key, value]) => filters[key as FilterKey] === value);
}

const kindLabel = (i18n: I18n, kind: ModelKind) => i18n.text(kind === "language" ? msg.languageModelKind : msg.decisionModelKind);

/** A model selection spans providers within one category. Provider details retain the individual connection. */
function modelChoices(models: readonly ModelGroup[], i18n: I18n, showKind: boolean): Choice[] {
  const entries = new Map<string, { modelId: string; modelKind: ModelKind; providers: Set<string> }>();
  for (const { modelId, modelKind, providerName } of models) {
    const id = JSON.stringify([modelKind, modelId]);
    const entry = entries.get(id);
    if (entry) entry.providers.add(providerName);
    else entries.set(id, { modelId, modelKind, providers: new Set([providerName]) });
  }
  return [...entries].map(([id, { modelId, modelKind, providers }]) => {
    const names = [...providers];
    const detail = names.length > 1 ? i18n.formatMessage(msg.providerCount, { count: names.length }) : names[0]!;
    return { id, label: modelId, color: null, keywords: names, narrowing: { modelId, modelKind },
      detail: showKind ? `${kindLabel(i18n, modelKind)} · ${detail}` : detail };
  });
}

const order: readonly FilterKey[] = ["modelKind", "folderId", "providerId", "modelId", "pluginId", "purposeId", "sessionId", "thinking", "subject"];
const chipLabels: Record<FilterKey, UiMessage> = {
  modelKind: msg.filterModelKind, folderId: msg.filterFolder, providerId: msg.filterProvider, modelId: msg.filterModel, pluginId: msg.filterPlugin,
  purposeId: msg.filterPurpose, sessionId: msg.filterSession, thinking: msg.filterThinking, subject: msg.filterSkill,
};

/** One searchable choice list across every facet; choosing a value toggles only the dimensions that value needs. */
export function FilterPicker({ model, facets, filters, labels }: {
  model: DashboardModel; facets: TelemetryFacets | null; filters: FilterDimensions; labels: Partial<Record<FilterKey, string>>;
}) {
  const i18n = useI18n();
  const showKind = facets?.providers.some(group => group.modelKind !== facets.providers[0]?.modelKind) ?? false;
  const sections = useMemo<FacetSection[]>(() => {
    if (!facets) return [];
    const choice = (group: TelemetryGroup, narrowing: FilterDimensions, detail: string | null = null): Choice => {
      const label = groupLabel(i18n, group);
      return { id: group.key, label, detail, color: groupColor(group), keywords: detail ? [label, detail] : [label], narrowing };
    };
    return [
      { id: "folder", label: msg.filterFolder, choices: [
        { id: "none", label: i18n.text(msg.noFolder), detail: null, color: null, keywords: [], narrowing: { folderId: null } },
        ...facets.folders.map(group => choice(group, { folderId: group.folderId })),
      ] },
      { id: "provider", label: msg.filterProvider, choices: facets.providers.map(group =>
        choice(group, { modelKind: group.modelKind, providerId: group.providerId }, showKind ? kindLabel(i18n, group.modelKind) : null)) },
      { id: "model", label: msg.filterModel, choices: modelChoices(facets.models, i18n, showKind) },
      { id: "purpose", label: msg.filterPurpose, choices: facets.purposes.map(group => choice(group, { pluginId: group.pluginId, purposeId: group.purposeId })) },
      { id: "plugin", label: msg.filterPlugin, choices: facets.plugins.length > 1 ? facets.plugins.map(group => choice(group, { pluginId: group.pluginId })) : [] },
      { id: "thinking", label: msg.filterThinking, choices: facets.thinking.map(group => choice(group, { thinking: group.level })) },
    ].filter(section => section.choices.length > 0);
  }, [facets, i18n, showKind]);
  // A purpose names its plugin, so the plugin dimension reads once in the applied list.
  const applied = (Object.keys(filters) as FilterKey[])
    .filter(key => !(key === "pluginId" && filters.purposeId !== undefined))
    .filter(key => key !== "modelKind" || showKind)
    .sort((left, right) => order.indexOf(left) - order.indexOf(right))
    .map(key => {
      // The whole narrowing must hold: a purpose also names its plugin, and must not stand in for a plugin filter.
      const found = sections.flatMap(section => section.choices).find(item => item.narrowing[key] === filters[key] && matches(filters, item.narrowing));
      const fallback = key === "modelKind" && filters.modelKind ? kindLabel(i18n, filters.modelKind) : String(filters[key] ?? i18n.text(msg.other));
      const text = i18n.formatMessage(msg.filterChip, { dimension: i18n.text(chipLabels[key]), value: (key === "modelKind" ? null : found?.label) ?? labels[key] ?? fallback });
      return { key, text };
    });
  return <Popover>
    <PopoverTrigger asChild>
      <Button variant={applied.length ? "selected" : "ghost"} size="sm" aria-label={i18n.text(msg.filter)}>
        <ListFilter />{i18n.text(msg.filter)}{applied.length > 0 && <span className="rounded bg-foreground/10 px-1 text-xs tabular-nums">{applied.length}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 p-0" motionPreset="command">
      <Command>
        <CommandInput placeholder={i18n.text(msg.search)} />
        {applied.length > 0 && <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
          {applied.map(row => <span key={row.key} className="inline-flex h-6 max-w-64 items-center gap-1 rounded-md bg-secondary pr-0.5 pl-2 text-xs text-secondary-foreground">
            <span className="min-w-0 truncate">{row.text}</span>
            <button type="button" aria-label={i18n.formatMessage(msg.removeFilter, { name: row.text })} onClick={() => model.removeFilter(row.key)}
              className="flex size-5 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-3" /></button>
          </span>)}
          <Button variant="link" size="xs" onClick={() => model.clearFilters()}>{i18n.text(msg.clearFilters)}</Button>
        </div>}
        <CommandList className="max-h-80">
          <CommandEmpty>{i18n.text(msg.noMatches)}</CommandEmpty>
          {sections.map(section => <CommandGroup key={section.id} heading={i18n.text(section.label)}>
            {section.choices.map(item => {
              const active = matches(filters, item.narrowing);
              return <CommandItem key={section.id + ":" + item.id} value={section.id + ":" + item.id} keywords={[item.label, item.detail ?? ""]}
                onSelect={() => {
                  if (!active) model.applyFilters(item.narrowing);
                  else for (const key of Object.keys(item.narrowing) as FilterKey[]) {
                    if (key !== "modelKind") model.removeFilter(key);
                  }
                }}>
                {item.color ? <FolderDot color={item.color} /> : <span className="size-2 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.detail && <span className="type-caption max-w-24 truncate">{item.detail}</span>}
                <Check className={cn("size-4", !active && "invisible")} />
              </CommandItem>;
            })}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
