import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert } from "lucide-react";
import { Card } from "@asterism-app/ui/ui/card";
import { Skeleton } from "@asterism-app/ui/ui/skeleton";
import { cn } from "@asterism-app/ui/utils";
import { useI18n } from "../../shared/i18n";
import { fadeTransition } from "../../shared/weave/motion";
import { dashboardMessages as msg } from "../../messages/dashboard";
import type { QueryState } from "./use-telemetry";

/**
 * A dashboard panel: a card shell with a header row and an inset content surface, matching workbench object cards.
 * On the window material the shell keeps its edge; embedded in an island sheet it is a borderless tone group.
 * The panel owns its own loading, failure, and empty states, so one slow or failed read never blanks the page.
 */
export function Panel({ title, icon, actions, embedded = false, className, bodyClassName, state, empty, skeleton, children }: {
  title: ReactNode; icon?: ReactNode; actions?: ReactNode; embedded?: boolean; className?: string; bodyClassName?: string;
  /** Reads the panel content depends on; the first read shows a skeleton, later reads keep the current content. */
  state?: QueryState<unknown> | readonly QueryState<unknown>[];
  /** Content shown instead of children when there is nothing to present. */
  empty?: ReactNode | false;
  skeleton?: ReactNode;
  children?: ReactNode;
}) {
  const i18n = useI18n();
  const states = state === undefined ? [] : Array.isArray(state) ? state as readonly QueryState<unknown>[] : [state as QueryState<unknown>];
  const loading = states.some(item => item.data === null && !item.error);
  const failed = states.some(item => item.data === null && item.error);
  const content = failed ? <PanelState icon={<CircleAlert className="text-destructive" />} label={i18n.text(msg.loadFailed)} />
    : loading ? skeleton ?? <PanelSkeleton />
    : empty ? empty
    : children;
  const phase = failed ? "failed" : loading ? "loading" : empty ? "empty" : "ready";
  return <Card className={cn("min-w-0 gap-0 overflow-hidden bg-card-shell py-0 shadow-none", embedded && "border-0", className)}>
    <header className="flex min-h-11 shrink-0 items-center gap-2 px-3 py-2">
      {icon && <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">{icon}</span>}
      <h2 className="type-section min-w-0 flex-1 truncate">{title}</h2>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
    <div className={cn("surface-inset relative mx-1 mb-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", bodyClassName)}
      aria-busy={states.some(item => item.pending) || undefined}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={phase} className="flex min-h-0 min-w-0 flex-1 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition}>
          {content}
        </motion.div>
      </AnimatePresence>
    </div>
  </Card>;
}

export function PanelState({ icon, label, action, className }: { icon?: ReactNode; label: ReactNode; action?: ReactNode; className?: string }) {
  return <div role="status" className={cn("flex min-h-32 flex-1 flex-col items-center justify-center gap-2 p-6 text-center", className)}>
    {icon && <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>}
    <p className="type-caption">{label}</p>
    {action}
  </div>;
}

export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return <div className={cn("flex flex-col gap-3 p-4", className)} aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-4" style={{ width: `${90 - index * 12}%` }} />)}
  </div>;
}

export function ChartSkeleton({ className }: { className?: string }) {
  return <div className={cn("flex items-end gap-1.5 p-4", className)} aria-hidden="true">
    {[40, 65, 30, 80, 55, 70, 45, 90, 60, 35, 75, 50].map((height, index) => <Skeleton key={index} className="flex-1" style={{ height: `${height}%` }} />)}
  </div>;
}
