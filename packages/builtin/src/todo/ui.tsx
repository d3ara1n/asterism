import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { useRef, useState, type ReactNode } from "react";
import type { z } from "zod";
import { useI18n, useRendererObject, type I18n } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { cn } from "@asterism-app/ui/utils";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { StatusIcon, type StatusTone } from "@asterism-app/ui/ui/status";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { todoMessages as messages } from "../messages/todo";
import { MutateTodo } from "./contract";
import type { Actor, Todo } from "./model";

export function todoFailure(error: unknown): UiText {
  return failureDisplay(error, messages.failed);
}
/** Deleted, transferred, and retention-pruned tasks all read as not_found once their list still exists. */
export function isNotFound(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "not_found";
}
export function TodoError({ error, className }: { error: UiText | null; className?: string }) {
  const i18n = useI18n();
  return error ? <Alert variant="destructive" className={cn("px-3 py-2", className)}><AlertDescription className="break-words">{i18n.text(error)}</AlertDescription></Alert> : null;
}
export function actorName(i18n: I18n, actor: Actor): string {
  return actor.kind === "user" ? i18n.text(messages.user) : actor.title;
}
export function formatMoment(i18n: I18n, value: string): string {
  return i18n.formatDate(Date.parse(value), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Task states are stored facts, not live work, so in-progress uses the still progress shape. */
export const todoTones = { pending: "neutral", in_progress: "progress", done: "success" } as const satisfies Record<Todo["status"], StatusTone>;
export function TodoStatusIcon({ status, tooltip = true }: { status: Todo["status"]; tooltip?: boolean }) {
  const label = useI18n().text(messages[status]);
  return <TooltipHint content={tooltip ? label : undefined}><span className="inline-flex shrink-0">
    <StatusIcon tone={todoTones[status]} still className="size-3.5" />
    <span className="sr-only">{label}</span>
  </span></TooltipHint>;
}

/** Each mounted entry gates only its own submission. */
export function useTodoMutation(onError?: (error: UiText) => void) {
  const object = useRendererObject();
  const gate = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const fail = (value: UiText) => { setError(value); onError?.(value); };
  const run = async (input: z.input<typeof MutateTodo.schema>) => {
    if (gate.current) return false;
    gate.current = true; setPending(true); setError(null);
    try {
      const result = await object.invoke(MutateTodo, input);
      if (!result.ok) { fail(todoFailure(result.error)); return false; }
      return true;
    } catch (failure) { fail(todoFailure(failure)); return false; }
    finally { gate.current = false; setPending(false); }
  };
  return { run, pending, error, clearError: () => setError(null) };
}

/** A destructive title bar action whose confirmation is anchored to the button itself. */
export function ConfirmButton({ label, icon, open, onOpenChange, disabled = false, children }: {
  label: string; icon: ReactNode; open: boolean; onOpenChange(open: boolean): void; disabled?: boolean; children: ReactNode;
}) {
  return <Popover open={open} onOpenChange={onOpenChange}>
    <IconButton size="icon-xs" label={label} disabled={disabled} className="text-destructive hover:text-destructive" asChild>
      <PopoverTrigger>{icon}</PopoverTrigger>
    </IconButton>
    <PopoverContent align="end" className="flex w-72 flex-col gap-3 p-3 text-sm">{children}</PopoverContent>
  </Popover>;
}
