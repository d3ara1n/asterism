import { useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, LayoutGrid } from "lucide-react";
import { Button } from "@asterism/ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@asterism/ui/ui/dropdown-menu";
import { workbenchMessages } from "../../messages/workbench";
import { useI18n } from "../../shared/i18n";
import type { WorkbenchCanvas } from "./canvas";

/** Separate layout category in the titlebar; operation state belongs only to this entry. */
export function LayoutMenu({ canvas, disabled }: { canvas: () => WorkbenchCanvas | null; disabled: boolean }) {
  const i18n = useI18n();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const arrange = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try { await canvas()?.arrange(); }
    finally { pending.current = false; setBusy(false); }
  };
  return <DropdownMenu modal={false}><DropdownMenuTrigger asChild>
    <Button variant="ghost" size="sm" disabled={disabled} aria-label={i18n.formatMessage(workbenchMessages.layout)}>
      <LayoutDashboard /><span className="toolbar-label">{i18n.formatMessage(workbenchMessages.layout)}</span><ChevronDown className="text-muted-foreground" />
    </Button>
  </DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuItem disabled={busy || disabled} onSelect={() => { void arrange(); }}>
      <LayoutGrid />{i18n.formatMessage(busy ? workbenchMessages.arranging : workbenchMessages.arrange)}
    </DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>;
}
