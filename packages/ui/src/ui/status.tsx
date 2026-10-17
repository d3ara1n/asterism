import type { ComponentProps, ReactNode } from "react";
import { Circle, CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "../utils";
import { Badge } from "./badge";
import { Spinner } from "./spinner";

/**
 * 状态的唯一表达入口：五类状态各有固定图标与 token 色，业务代码不直接写状态颜色。
 * 颜色不单独表达含义，始终与图标和文字同时出现。
 */
export type StatusTone = "success" | "warning" | "error" | "progress" | "neutral";

const icons: Record<Exclude<StatusTone, "progress">, LucideIcon> = { success: CircleCheck, warning: TriangleAlert, error: CircleAlert, neutral: Circle };
const colors: Record<StatusTone, string> = {
  success: "text-success", warning: "text-warning", error: "text-destructive", progress: "text-primary-text", neutral: "text-muted-foreground",
};
const badgeTones = {
  success: "success", warning: "warning", error: "destructive", progress: "default", neutral: "secondary",
} as const satisfies Record<StatusTone, ComponentProps<typeof Badge>["variant"]>;

/** 图标可按领域替换（如等待处理用手势图标），颜色仍由状态决定。 */
export function StatusIcon({ tone, icon, className }: { tone: StatusTone; icon?: LucideIcon; className?: string }) {
  if (tone === "progress") return <Spinner aria-hidden="true" className={cn(colors[tone], "motion-reduce:animate-none", className)} />;
  const Icon = icon ?? icons[tone];
  return <Icon aria-hidden="true" className={cn(colors[tone], className)} />;
}

/** 列表与标题中的状态标记；图标继承对应实色表面的前景色。 */
export function StatusBadge({ tone, children, className, ...props }: Omit<ComponentProps<typeof Badge>, "variant" | "asChild"> & { tone: StatusTone }) {
  return <Badge {...props} variant={badgeTones[tone]} className={cn("font-normal", className)}><StatusIcon tone={tone} className="text-current" />{children}</Badge>;
}

/** 行内状态说明；错误文字同时使用错误色。 */
export function StatusText({ tone, icon, children, className }: { tone: StatusTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return <span className={cn("type-caption inline-flex min-w-0 items-center gap-1.5", tone === "error" && "text-destructive", className)}>
    <StatusIcon tone={tone} icon={icon} className="size-3 shrink-0" /><span className="min-w-0 break-words">{children}</span>
  </span>;
}
