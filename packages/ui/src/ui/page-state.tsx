import type { ReactNode } from "react";
import { CircleAlert, Loader2, PlugZap, Inbox } from "lucide-react";
import { cn } from "../utils";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./empty";

/**
 * Page-level states composed from the official Empty:
 * loading means reading; empty means not yet created/configured; unavailable means the capability is not yet integrated; error means reading or an operation failed.
 */
export type PageStateKind = "loading" | "empty" | "unavailable" | "error";
const icons = { loading: Loader2, empty: Inbox, unavailable: PlugZap, error: CircleAlert };

export function PageState({ kind, title, body, action, className }: { kind: PageStateKind; title: string; body?: string; action?: ReactNode; className?: string }) {
  const Icon = icons[kind];
  return <Empty role={kind === "error" ? "alert" : "status"} className={className}>
    <EmptyHeader>
      <EmptyMedia variant="icon" className={cn(kind === "error" && "text-destructive")}><Icon className={cn(kind === "loading" && "animate-spin")} /></EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      {body && <EmptyDescription>{body}</EmptyDescription>}
    </EmptyHeader>
    {action && <EmptyContent>{action}</EmptyContent>}
  </Empty>;
}
