import { useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleArrowUp } from "lucide-react";
import { Button } from "@asterism/ui/ui/button";
import { StatusIcon } from "@asterism/ui/ui/status";
import { Popover, PopoverContent, PopoverTrigger } from "@asterism/ui/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism/ui/ui/tooltip";
import { Progress } from "@asterism/ui/ui/progress";
import { updatesMessages as messages } from "../messages/updates";
import { useI18n } from "../shared/i18n";
import { fadeTransition } from "../shared/weave/motion";
import { useUpdates } from "../features/updates/state";
import { UpdateAction, UpdateError, useUpdateSummary } from "../features/updates/controls";

/** 更新入口在浮层打开期间保持可见，承接重试后的检查与结果。 */
export function UpdateIndicator({ onSettings }: { onSettings: () => void }) {
  const i18n = useI18n();
  const { state, failure } = useUpdates();
  const summary = useUpdateSummary();
  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  const titleId = useId();
  if (!state?.enabled) return null;
  const status = failure ? "error" : state.status;
  if (!open && status !== "downloading" && status !== "ready" && status !== "error") return null;

  return <Popover open={open} onOpenChange={setOpen}>
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-xs" className="shrink-0"
            aria-label={i18n.formatMessage(messages.indicatorLabel, { status: summary })}>
            <span className="relative size-4" aria-hidden="true">
              <AnimatePresence initial={false}>
                <motion.span key={status} className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition}>
                  {status === "downloading" || status === "checking" ? <StatusIcon tone="progress" className="size-4" />
                    : status === "ready" ? <CircleArrowUp className="size-4 text-primary-text" />
                    : <StatusIcon tone={status === "error" ? "error" : "neutral"} className="size-4" />}
                </motion.span>
              </AnimatePresence>
            </span>
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent>{summary}</TooltipContent>
    </Tooltip>
    <PopoverContent side="bottom" align="start" className="space-y-3" aria-labelledby={titleId}
      onCloseAutoFocus={event => {
        if (navigating.current) {
          event.preventDefault();
          navigating.current = false;
        }
      }}>
      <h2 id={titleId} className="type-section">{i18n.text(messages.title)}</h2>
      <div className="space-y-1">
        <p className="type-body" role="status">{summary}</p>
        <p className="type-caption break-words">
          {state.availableVersion
            ? i18n.formatMessage(messages.versionChange, { current: state.version, next: state.availableVersion })
            : i18n.formatMessage(messages.version, { version: state.version })}
        </p>
      </div>
      {state.status === "downloading" && <Progress value={state.progress} aria-label={i18n.text(messages.title)} />}
      {state.status === "ready" && <p className="type-caption">{i18n.text(messages.installHint)}</p>}
      <UpdateError />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => {
          navigating.current = true;
          setOpen(false);
          onSettings();
        }}>{i18n.text(messages.settings)}</Button>
        <UpdateAction />
      </div>
    </PopoverContent>
  </Popover>;
}
