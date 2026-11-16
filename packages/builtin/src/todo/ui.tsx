import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { Tooltip, TooltipTrigger, TooltipContent } from "@asterism-app/ui/ui/tooltip";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import type { z } from "zod";
import { MoreHorizontal } from "lucide-react";
import { useI18n, useRendererObject, type I18n } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { cn } from "@asterism-app/ui/utils";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { ActionMenu, ActionMenuContent, ActionMenuGroup, ActionMenuTarget, ActionMenuTrigger } from "@asterism-app/ui/ui/action-menu";
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
export function TodoStatusIcon({ status, tooltip = true }: { status: Todo["status"]; tooltip?: boolean }) {
  const label = useI18n().text(messages[status]);
  return <TooltipHint content={tooltip ? label : undefined}><span className="inline-flex shrink-0">
    <StatusIcon tone={tones[status]} still className="size-3.5" />
    <span className="sr-only">{label}</span>
  </span></TooltipHint>;
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
 * An object menu whose items can open a confirmation anchored to its overflow trigger.
 * The render prop places that trigger inside the target surface. handOff keeps the menu
 * from returning focus when the selected item moves focus to a confirmation or editor.
 */
export function MenuConfirm({ label, items, open, onOpenChange, disabled = false, blankOnly = false, confirmation, children }: {
  label: string;
  items: (confirm: () => void, handOff: () => void) => ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  disabled?: boolean;
  blankOnly?: boolean;
  confirmation: ReactNode;
  children: (trigger: ReactNode) => ReactElement;
}) {
  const keepFocus = useRef(false);
  const handOff = () => { keepFocus.current = true; };
  const trigger = <Tooltip>
    <PopoverAnchor asChild><ActionMenuTrigger asChild><TooltipTrigger asChild>
      <Button size="icon-xs" variant="ghost" disabled={disabled} aria-label={label}><MoreHorizontal /></Button>
    </TooltipTrigger></ActionMenuTrigger></PopoverAnchor>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
  return <Popover open={open} onOpenChange={onOpenChange}>
    <ActionMenu>
      <ActionMenuTarget asChild disabled={disabled} blankOnly={blankOnly}>{children(trigger)}</ActionMenuTarget>
      <ActionMenuContent align="end" onCloseAutoFocus={event => {
        if (keepFocus.current) { event.preventDefault(); keepFocus.current = false; }
      }}>
        <ActionMenuGroup>{items(() => { handOff(); onOpenChange(true); }, handOff)}</ActionMenuGroup>
      </ActionMenuContent>
    </ActionMenu>
    <PopoverContent align="end" className="flex w-72 flex-col gap-3 p-3 text-sm">{confirmation}</PopoverContent>
  </Popover>;
}
