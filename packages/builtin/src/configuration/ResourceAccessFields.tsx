import { useId, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import type { AgentConfiguration } from "@asterism-app/builtin-api/contracts";
import { useI18n, useRendererResources } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@asterism-app/ui/ui/command";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@asterism-app/ui/ui/field";
import { Popover, PopoverTrigger, PopoverContent } from "@asterism-app/ui/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { ModifiedNote } from "@asterism-app/ui/configuration-forms";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { agentsMessages } from "../messages/agents";

type Policy = Pick<AgentConfiguration, "resources" | "excludeResources">;
export function ResourceAccessFields({ value, onChange, modified, onRestore }: {
  value: Policy; onChange(value: Policy): void; modified: boolean; onRestore(): void;
}) {
  const i18n = useI18n(), catalog = useRendererResources(), id = useId();
  const [open, setOpen] = useState(false);
  const mode = value.resources !== null ? "allow" : value.excludeResources !== null ? "exclude" : "all";
  const selected = value.resources ?? value.excludeResources ?? [];
  const known = catalog.list();
  const setList = (items: string[]) => onChange(mode === "allow"
    ? { resources: items, excludeResources: null } : { resources: null, excludeResources: items });
  const toggle = (kind: string) => setList(selected.includes(kind) ? selected.filter(item => item !== kind) : [...selected, kind]);
  return <FieldGroup>
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel id={`${id}-mode`}>{i18n.formatMessage(agentsMessages.resourceAccessMode)}</FieldLabel>
        {modified && <ModifiedNote onRestore={onRestore} />}
      </div>
      <ToggleGroup type="single" variant="outline" size="sm" value={mode} aria-labelledby={`${id}-mode`}
        onValueChange={next => {
          if (next) onChange({ resources: next === "allow" ? selected : null, excludeResources: next === "exclude" ? selected : null });
        }}>
        <ToggleGroupItem value="all">{i18n.formatMessage(agentsMessages.resourcesAll)}</ToggleGroupItem>
        <ToggleGroupItem value="allow">{i18n.formatMessage(agentsMessages.resourcesAllow)}</ToggleGroupItem>
        <ToggleGroupItem value="exclude">{i18n.formatMessage(agentsMessages.resourcesExclude)}</ToggleGroupItem>
      </ToggleGroup>
      <FieldDescription>{i18n.formatMessage(agentsMessages.resourceAccessHint)}</FieldDescription>
    </Field>
    {mode !== "all" && <FieldSet>
      <FieldLegend variant="label">{i18n.formatMessage(mode === "allow" ? agentsMessages.allowedResourceTypes : agentsMessages.excludedResourceTypes)}</FieldLegend>
      <FieldDescription>{i18n.formatMessage(mode === "allow" ? agentsMessages.resourcesAllowHint : agentsMessages.resourcesExcludeHint)}</FieldDescription>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between" aria-expanded={open}>
            {i18n.formatMessage(agentsMessages.chooseResourceTypes)}<ChevronDown data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder={i18n.formatMessage(agentsMessages.searchResourceTypes)} />
            <CommandList>
              <CommandEmpty>{i18n.formatMessage(commonMessages.noMatches)}</CommandEmpty>
              <CommandGroup>
                {known.map(resource => <CommandItem key={resource.kind} value={resource.kind} keywords={[i18n.text(resource.label)]}
                  onSelect={() => toggle(resource.kind)}>
                  <span aria-hidden="true">{resource.icon}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span>{i18n.text(resource.label)}</span>
                    <span className="type-caption break-all">{resource.kind}</span>
                  </span>
                  {selected.includes(resource.kind) && <Check aria-label={i18n.formatMessage(agentsMessages.resourceSelected)} />}
                </CommandItem>)}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && <ul className="flex flex-col gap-3">
        {known.filter(resource => selected.includes(resource.kind)).map(resource => {
          const { kind } = resource;
          const name = i18n.text(resource.label);
          return <li key={kind} className="flex items-center gap-3">
            <span aria-hidden="true">{resource.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="type-label">{name}</p>
              <p className="type-caption break-all">{kind}</p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => toggle(kind)}
              aria-label={i18n.formatMessage(agentsMessages.removeResourceType, { name })}><X /></Button>
          </li>;
        })}
      </ul>}
    </FieldSet>}
  </FieldGroup>;
}
