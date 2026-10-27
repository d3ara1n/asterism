import { useEffect, useRef, type MouseEvent } from "react";
import { toast } from "sonner";
import type { RendererReceipt } from "@asterism-app/sdk/renderer";
import { errorDisplay } from "../../shared/error-display";
import { getI18n } from "./i18n";

export { toast };

/** The operation entry consumes this call's receipt; failures are reported immediately without storing them in session or other object state. */
export function operationSucceeded(result: RendererReceipt): boolean {
  if (!result.ok) toast.error(getI18n().text(errorDisplay(result.error)));
  return result.ok;
}

export interface ToastAction { label: string; onClick: () => void }

/**
 * State-driven persistent notifications: show while message exists, remove when cleared, and do not disappear automatically.
 * Error notifications with onDismiss can be dismissed, writing the dismissal back to state; action buttons do not close notifications, which are removed by state changes.
 * In-progress notifications cannot be dismissed and end only through actions (such as cancellation).
 */
export function useStateToast(message: string | null, options: {
  tone: "error" | "loading"; action?: ToastAction; onDismiss?: () => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const tone = options.tone;
  const actionLabel = options.action?.label;
  const dismissible = tone === "error" && !!options.onDismiss;
  useEffect(() => {
    if (!message) return;
    let active = true;
    const action = actionLabel ? { label: actionLabel, onClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (active) latest.current.action?.onClick();
    } } : undefined;
    const common = { duration: Infinity, action, dismissible, closeButton: dismissible };
    const toastId = tone === "loading" ? toast.loading(message, common)
      : toast.error(message, { ...common, onDismiss: () => { if (active) latest.current.onDismiss?.(); } });
    return () => {
      active = false;
      // Sonner queues insertion in a timer; dismiss afterward so removal cannot precede insertion.
      setTimeout(() => toast.dismiss(toastId), 0);
    };
  }, [message, tone, actionLabel, dismissible]);
}
