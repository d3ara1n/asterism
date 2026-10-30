import { useId, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import type { AgentConfiguration } from "@asterism-app/builtin-api/contracts";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@asterism-app/ui/ui/command";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@asterism-app/ui/ui/field";
import { Popover, PopoverTrigger, PopoverContent } from "@asterism-app/ui/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { ModifiedNote } from "@asterism-app/ui/configuration-forms";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { agentsMessages } from "../messages/agents";

export function DelegationFields({ value, agents, onChange, modified, onRestore }: {
  value: string[] | null; agents: readonly AgentConfiguration[]; onChange(value: string[] | null): void;
  modified: boolean; onRestore(): void;
}) {
  const i18n = useI18n(), id = useId();
  const [open, setOpen] = useState(false);
  const selected = value ?? [];
  const toggle = (agent: string) => onChange(selected.includes(agent) ? selected.filter(item => item !== agent) : [...selected, agent]);
  return <FieldGroup>
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel id={id}>{i18n.formatMessage(agentsMessages.delegateTargets)}</FieldLabel>
        {modified && <ModifiedNote onRestore={onRestore} />}
      </div>
      <ToggleGroup type="single" variant="outline" size="sm" value={value === null ? "all" : "allow"} aria-labelledby={id}
        onValueChange={mode => { if (mode) onChange(mode === "all" ? null : selected); }}>
        <ToggleGroupItem value="all">{i18n.formatMessage(agentsMessages.resourcesAll)}</ToggleGroupItem>
        <ToggleGroupItem value="allow">{i18n.formatMessage(agentsMessages.resourcesAllow)}</ToggleGroupItem>
      </ToggleGroup>
      <FieldDescription>{i18n.formatMessage(agentsMessages.delegatesHint)}</FieldDescription>
    </Field>
    {value !== null && <Field>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-between" aria-expanded={open}>
          {i18n.formatMessage(agentsMessages.chooseDelegates)}<ChevronDown data-icon="inline-end" />
        </Button></PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command>
          <CommandInput placeholder={i18n.formatMessage(agentsMessages.searchDelegates)} />
          <CommandList><CommandEmpty>{i18n.formatMessage(commonMessages.noMatches)}</CommandEmpty><CommandGroup>
            {agents.filter(agent => agent.enabled).map(agent => <CommandItem key={agent.id} value={agent.id} keywords={[agent.description]} onSelect={() => toggle(agent.id)}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span>{agent.id}</span><span className="type-caption line-clamp-2">{agent.description}</span>
              </span>
              {selected.includes(agent.id) && <Check aria-label={i18n.formatMessage(agentsMessages.resourceSelected)} />}
            </CommandItem>)}
          </CommandGroup></CommandList>
        </Command></PopoverContent>
      </Popover>
      <FieldDescription>{i18n.formatMessage(agentsMessages.delegatesAllowHint)}</FieldDescription>
      {selected.length > 0 && <ul className="flex flex-col gap-3">
        {agents.filter(agent => selected.includes(agent.id)).map(agent => <li key={agent.id} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="type-label">{agent.id}{!agent.enabled && i18n.formatMessage(agentsMessages.disabledSuffix)}</p>
            <p className="type-caption line-clamp-2">{agent.description}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => toggle(agent.id)}
            aria-label={i18n.formatMessage(agentsMessages.removeDelegate, { name: agent.id })}><X /></Button>
        </li>)}
      </ul>}
    </Field>}
  </FieldGroup>;
}
