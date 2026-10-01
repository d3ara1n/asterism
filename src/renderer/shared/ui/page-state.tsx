import type { ReactNode } from "react";
import { CircleAlert, Loader2, PlugZap, Inbox } from "lucide-react";
import { cn } from "../utils";

/**
 * 页面级状态的统一呈现：
 * loading 正在读取；empty 用户尚未创建/配置；unavailable 能力尚未接入（不提供可操作按钮）；error 读取或操作失败。
 */
export type PageStateKind = "loading" | "empty" | "unavailable" | "error";
const icons = { loading: Loader2, empty: Inbox, unavailable: PlugZap, error: CircleAlert };

export function PageState({ kind, title, body, action, className }: { kind: PageStateKind; title: string; body?: string; action?: ReactNode; className?: string }) {
  const Icon = icons[kind];
  return <div role={kind === "error" ? "alert" : "status"} className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
    <span className={cn("mb-4 flex size-10 items-center justify-center rounded-surface",
      kind === "error" ? "bg-destructive-soft text-destructive" : kind === "unavailable" ? "bg-warning-soft text-warning" : "bg-secondary text-primary")} aria-hidden="true">
      <Icon className={cn("size-5", kind === "loading" && "animate-spin")} />
    </span>
    <h3 className="type-section">{title}</h3>
    {body && <p className="type-caption mt-1.5 max-w-sm">{body}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>;
}
