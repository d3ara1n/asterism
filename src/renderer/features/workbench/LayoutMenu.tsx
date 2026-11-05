import { useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, LayoutGrid, GitBranch, Grid3X3, AlignJustify, CircleDot } from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@asterism-app/ui/ui/dropdown-menu";
import { workbenchMessages } from "../../messages/workbench";
import { useI18n } from "../../shared/i18n";
import type { WorkbenchCanvas } from "./canvas";
import { orbitOrbit, orbitBox, boxBox, orbitGrid, columnColumn } from "./layout";
import type { LayoutStrategy } from "./layout";

type StrategyEntry = {
  strategy: LayoutStrategy;
  messageKey: keyof typeof workbenchMessages;
  icon: React.ReactNode;
};

const strategies: StrategyEntry[] = [
  { strategy: orbitOrbit,     messageKey: "arrangeOrbitOrbit",     icon: <CircleDot /> },
  { strategy: orbitBox,       messageKey: "arrangeOrbitBox",       icon: <GitBranch /> },
  { strategy: boxBox,         messageKey: "arrangeBoxBox",         icon: <LayoutGrid /> },
  { strategy: orbitGrid,      messageKey: "arrangeOrbitGrid",      icon: <Grid3X3 /> },
  { strategy: columnColumn,   messageKey: "arrangeColumnColumn",   icon: <AlignJustify /> },
];

/** Layout menu in the titlebar; each item triggers a specific arrangement strategy. */
export function LayoutMenu({ canvas, disabled }: { canvas: () => WorkbenchCanvas | null; disabled: boolean }) {
  const i18n = useI18n();
  const pending = useRef<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const arrange = async (entry: StrategyEntry) => {
    if (pending.current) return;
    pending.current = entry.strategy.id;
    setBusy(entry.strategy.id);
    try { await canvas()?.arrange(entry.strategy); }
    finally { pending.current = null; setBusy(null); }
  };

  return <DropdownMenu modal={false}><DropdownMenuTrigger asChild>
    <Button variant="ghost" size="sm" disabled={disabled} aria-label={i18n.formatMessage(workbenchMessages.layout)}>
      <LayoutDashboard /><span className="toolbar-label">{i18n.formatMessage(workbenchMessages.layout)}</span><ChevronDown className="text-muted-foreground" />
    </Button>
  </DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuLabel>{i18n.formatMessage(workbenchMessages.arrange)}</DropdownMenuLabel>
    {strategies.map(entry => (
      <DropdownMenuItem key={entry.strategy.id} disabled={!!busy || disabled} onSelect={() => { void arrange(entry); }}>
        {busy === entry.strategy.id ? <LayoutDashboard className="animate-spin" /> : entry.icon}
        {i18n.formatMessage(busy === entry.strategy.id ? workbenchMessages.arranging : workbenchMessages[entry.messageKey])}
      </DropdownMenuItem>
    ))}
  </DropdownMenuContent></DropdownMenu>;
}
