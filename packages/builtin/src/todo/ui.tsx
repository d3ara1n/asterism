import { useRef, useState, type ReactNode } from "react";
import type { z } from "zod";
import { MoreHorizontal } from "lucide-react";
import { useI18n, useRendererObject, type I18n } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { cn } from "@asterism-app/ui/utils";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@asterism-app/ui/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@asterism-app/ui/ui/popover";
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
const tones = { pending: "neutral", in_progress: "progress", done: "success" } as const satisfies Record<Todo["status"], StatusTone>;
export function TodoStatusIcon({ status }: { status: Todo["status"] }) {
  const label = useI18n().text(messages[status]);
  return <span className="inline-flex shrink-0" title={label}>
    <StatusIcon tone={tones[status]} still className="size-3.5" />
    <span className="sr-only">{label}</span>
  </span>;
}
export function TodoStatusBadge({ status }: { status: Todo["status"] }) {
  return <Badge variant="outline" className="font-normal">
    <StatusIcon tone={tones[status]} still className="size-3" />{useI18n().text(messages[status])}
  </Badge>;
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

/**
 * An overflow menu whose items can open a confirmation anchored to the same trigger.
 * items receives confirm, which opens the confirmation, and handOff, which keeps the menu from
 * returning focus to its trigger when the selected item moves focus elsewhere.
 */
export function MenuConfirm({ label, items, open, onOpenChange, children }: {
  label: string;
  items: (confirm: () => void, handOff: () => void) => ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  children: ReactNode;
}) {
  const keepFocus = useRef(false);
  const handOff = () => { keepFocus.current = true; };
  return <Popover open={open} onOpenChange={onOpenChange}>
    <DropdownMenu>
      <PopoverAnchor asChild>
        <DropdownMenuTrigger asChild>
          <Button size="icon-xs" variant="ghost" aria-label={label} title={label}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
      </PopoverAnchor>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => {
        if (keepFocus.current) { event.preventDefault(); keepFocus.current = false; }
      }}>
        {items(() => { handOff(); onOpenChange(true); }, handOff)}
      </DropdownMenuContent>
    </DropdownMenu>
    <PopoverContent align="end" className="flex w-72 flex-col gap-3 p-3 text-sm">{children}</PopoverContent>
  </Popover>;
}
