import { useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@asterism-app/ui/ui/command";
import { cn } from "@asterism-app/ui/utils";
import { configurationMessages } from "../../messages/configuration";

export interface ConfigurationChoice {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
  navigation?: boolean;
}

/** Local selection list shared by configuration pages; browsing highlights and saved selections are represented separately. */
export function ConfigurationOptions({ label, options, selected, initialActive = selected, active, disabled, searchPlaceholder, onSelect, onActiveChange, fill = false }: {
  label: string; options: ConfigurationChoice[]; selected: string; initialActive?: string; disabled: boolean; searchPlaceholder?: string;
  active?: string;
  onSelect(value: string): void;
  onActiveChange?(value: string): void;
  fill?: boolean;
}) {
  const i18n = useI18n();
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [localActive, setLocalActive] = useState(initialActive);
  useLayoutEffect(() => { (input.current ?? list.current)?.focus({ preventScroll: true }); }, []);
  return <Command label={label} value={active ?? localActive} onValueChange={value => {
    if (active === undefined) setLocalActive(value);
    onActiveChange?.(value);
  }} loop className="min-h-0 flex-1" aria-busy={disabled}>
    {searchPlaceholder && <CommandInput ref={input} placeholder={searchPlaceholder} />}
    <CommandList ref={list} label={label} className={cn("min-h-0 overscroll-contain", fill && "max-h-none flex-1")}>
      <CommandEmpty>{i18n.text(commonMessages.noMatches)}</CommandEmpty>
      <CommandGroup>
        {options.map(option => <CommandItem key={option.value} value={option.value}
          keywords={[option.label, option.description ?? "", ...(option.keywords ?? [])]}
          disabled={disabled} onSelect={() => onSelect(option.value)}>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="wrap-anywhere">{option.label}</span>
            {option.description && <span className="type-caption line-clamp-2 wrap-anywhere text-muted-foreground" title={option.description}>{option.description}</span>}
          </span>
          {option.navigation ? <ChevronRight aria-hidden="true" className="ml-auto" />
            : <Check aria-hidden="true" className={cn("ml-auto", selected !== option.value && "invisible")} />}
          {selected === option.value && <span className="sr-only">{i18n.text(configurationMessages.selected)}</span>}
        </CommandItem>)}
      </CommandGroup>
    </CommandList>
  </Command>;
}
