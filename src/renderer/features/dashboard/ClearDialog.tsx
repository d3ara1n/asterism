import { useState } from "react";
import type { UiMessage } from "@asterism-app/sdk/contracts";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@asterism-app/ui/ui/alert-dialog";
import { Label } from "@asterism-app/ui/ui/label";
import { RadioGroup, RadioGroupItem } from "@asterism-app/ui/ui/radio-group";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { useI18n } from "../../shared/i18n";
import { toast } from "../../shared/toast";
import { runtime } from "../../runtime";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { localOffset, monthsBefore } from "./range";

const choices: readonly { id: string; months: number | null; label: UiMessage }[] = [
  { id: "3m", months: 3, label: msg.period3m }, { id: "6m", months: 6, label: msg.period6m },
  { id: "1y", months: 12, label: msg.period1y }, { id: "2y", months: 24, label: msg.period2y },
  { id: "all", months: null, label: msg.clearEverything },
];

/** Permanent deletion of usage records by age. Statistics are kept indefinitely unless the user deletes them here. */
export function ClearDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const i18n = useI18n();
  const [choice, setChoice] = useState("1y");
  const [busy, setBusy] = useState(false);
  const selected = choices.find(item => item.id === choice)!;
  const now = Date.now();
  const before = selected.months === null ? null : monthsBefore(now, selected.months, localOffset(now));
  const clear = async () => {
    setBusy(true);
    try {
      const result = await runtime.telemetry.execute({ type: "clear", before });
      if (result.ok && result.reply.kind === "clear") {
        toast.success(i18n.formatMessage(msg.clearDone, { count: result.reply.deleted }));
        onOpenChange(false);
      } else toast.error(i18n.text(msg.clearFailed));
    } catch { toast.error(i18n.text(msg.clearFailed)); }
    finally { setBusy(false); }
  };
  return <AlertDialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{i18n.text(msg.clearTitle)}</AlertDialogTitle>
        <AlertDialogDescription>{i18n.text(msg.clearDescription)}</AlertDialogDescription>
      </AlertDialogHeader>
      <RadioGroup value={choice} onValueChange={setChoice} aria-label={i18n.text(msg.clearScope)} className="gap-2">
        {choices.map(item => <div key={item.id} className="flex items-center gap-2">
          <RadioGroupItem id={`usage-clear-${item.id}`} value={item.id} />
          <Label htmlFor={`usage-clear-${item.id}`} className="font-normal">
            {item.months === null ? i18n.text(item.label) : i18n.formatMessage(msg.clearOlder, { period: i18n.text(item.label) })}
          </Label>
        </div>)}
      </RadioGroup>
      {before !== null && <p className="type-caption">{i18n.formatMessage(msg.clearPreview, { date: i18n.formatDate(before, { dateStyle: "long" }) })}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>{i18n.text(commonMessages.cancel)}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={busy} onClick={event => { event.preventDefault(); void clear(); }}>{i18n.text(msg.clearConfirm)}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
