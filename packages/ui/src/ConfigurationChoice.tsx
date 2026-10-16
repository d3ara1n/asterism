import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

/** 输入托盘中的配置选择，首页与会话复用相同控件。 */
export function ConfigurationChoice({ icon, label, value, selected, options, disabled, onSelect }: {
  icon: ReactNode; label: string; value: string; selected: string; disabled?: boolean;
  options: { value: string; label: string }[]; onSelect: (value: string) => void;
}) {
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="xs" disabled={disabled} aria-label={`${label}: ${value}`} className="max-w-48 text-muted-foreground hover:text-foreground">
        {icon}<span className="truncate">{value}</span><ChevronDown className="opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-44">
      <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={selected} onValueChange={onSelect}>
        {options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
