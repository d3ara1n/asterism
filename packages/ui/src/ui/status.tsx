import type { ComponentProps, ReactNode } from "react";
import { Circle, CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "../utils";
import { Badge } from "./badge";
import { Spinner } from "./spinner";

/**
 * The sole entry point for status presentation: each of the five status categories has a fixed icon and token color; business code does not set status colors directly.
 * Color never conveys meaning alone; it always appears with an icon and text.
 */
export type StatusTone = "success" | "warning" | "error" | "progress" | "neutral";

const icons: Record<Exclude<StatusTone, "progress">, LucideIcon> = { success: CircleCheck, warning: TriangleAlert, error: CircleAlert, neutral: Circle };
const colors: Record<StatusTone, string> = {
  success: "text-success", warning: "text-warning", error: "text-destructive", progress: "text-primary-text", neutral: "text-muted-foreground",
};
const badgeTones = {
  success: "success", warning: "warning", error: "destructive", progress: "default", neutral: "secondary",
} as const satisfies Record<StatusTone, ComponentProps<typeof Badge>["variant"]>;

/** Icons can be replaced for the domain, such as a hand icon when awaiting action; status still determines the color. */
export function StatusIcon({ tone, icon, className }: { tone: StatusTone; icon?: LucideIcon; className?: string }) {
  if (tone === "progress") return <Spinner aria-hidden="true" className={cn(colors[tone], "motion-reduce:animate-none", className)} />;
  const Icon = icon ?? icons[tone];
  return <Icon aria-hidden="true" className={cn(colors[tone], className)} />;
}

/** Status markers in lists and titles; icons inherit the foreground color of the corresponding solid surface. */
export function StatusBadge({ tone, children, className, ...props }: Omit<ComponentProps<typeof Badge>, "variant" | "asChild"> & { tone: StatusTone }) {
  return <Badge {...props} variant={badgeTones[tone]} className={cn("font-normal", className)}><StatusIcon tone={tone} className="text-current" />{children}</Badge>;
}

/** Inline status descriptions; error text also uses the error color. */
export function StatusText({ tone, icon, children, className }: { tone: StatusTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return <span className={cn("type-caption inline-flex min-w-0 items-center gap-1.5", tone === "error" && "text-destructive", className)}>
    <StatusIcon tone={tone} icon={icon} className="size-3 shrink-0" /><span className="min-w-0 break-words">{children}</span>
  </span>;
}
