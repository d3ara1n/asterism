import { useState } from "react";
import { useI18n, useRendererObject, type RendererReceipt } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { commonMessages as uiMessages } from "@asterism-app/ui/messages/common";
import { scheduleMessages as messages } from "../messages/schedules";

export const pad2 = (value: number) => String(value).padStart(2, "0");
/** Monday-first display order of Sunday-0 weekday numbers. */
export const weekOrder = [1, 2, 3, 4, 5, 6, 0] as const;
/** 2024-01-07 is a Sunday, so adding a weekday number yields a date on that weekday. */
export const weekdayDate = (day: number) => new Date(2024, 0, 7 + day).getTime();

export function useScheduleAction() {
  const object = useRendererObject(), i18n = useI18n();
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const disabled = pending || !object.view.ready;
  const run = async (work: () => Promise<RendererReceipt>) => {
    if (disabled) return false;
    setPending(true); setError(null);
    try {
      const result = await work();
      if (!result.ok) { setError(result.error.display ? i18n.text(result.error.display) : i18n.text(messages.failed)); return false; }
      return true;
    } catch (error) {
      console.error("Schedule update failed.", error);
      setError(i18n.text(messages.failed));
      return false;
    } finally { setPending(false); }
  };
  return { object, disabled, error, run };
}

export function ScheduleError({ error }: { error: string | null }) {
  return error ? <p role="alert" className="type-caption text-center text-destructive">{error}</p> : null;
}

/** The front's message line; an empty message is the one state that blocks activation, so it links to the editor. */
export function MessageLine({ message, onEdit, editable }: { message: string; onEdit(): void; editable: boolean }) {
  const i18n = useI18n();
  if (message.trim()) return <p className="type-caption min-w-0 flex-1 truncate" title={message}>{message}</p>;
  return <button type="button" disabled={!editable} onClick={onEdit}
    className="type-label min-w-0 flex-1 truncate text-left text-warning underline-offset-2 enabled:hover:underline disabled:opacity-50">
    {i18n.text(messages.noMessage)}
  </button>;
}

export function MessageInput({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled: boolean }) {
  const i18n = useI18n();
  return <Textarea rows={2} maxLength={4000} disabled={disabled} value={value} onChange={event => onChange(event.target.value)}
    placeholder={i18n.text(messages.message)} aria-label={i18n.text(messages.message)}
    className="field-sizing-fixed min-h-0 flex-1 resize-none" />;
}

export function BackFooter({ disabled, canSubmit, onCancel }: { disabled: boolean; canSubmit: boolean; onCancel(): void }) {
  const i18n = useI18n();
  return <div className="mt-auto flex shrink-0 justify-end gap-2">
    <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>{i18n.text(uiMessages.cancel)}</Button>
    <Button type="submit" size="sm" disabled={disabled || !canSubmit}>{i18n.text(messages.done)}</Button>
  </div>;
}
