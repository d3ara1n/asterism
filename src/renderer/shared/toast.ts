import { useEffect, useRef, type MouseEvent } from "react";
import { toast } from "sonner";
import type { RendererReceipt } from "@asterism/sdk/renderer";
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
export function useStateToast(id: string, message: string | null, options: {
  tone: "error" | "loading"; action?: ToastAction; onDismiss?: () => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const actionLabel = options.action?.label;
  const dismissible = options.tone === "error" && !!options.onDismiss;
  useEffect(() => {
    if (!message) { toast.dismiss(id); return; }
    const { tone } = latest.current;
    const action = actionLabel ? { label: actionLabel, onClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      latest.current.action?.onClick();
    } } : undefined;
    const common = { id, duration: Infinity, action, dismissible, closeButton: dismissible };
    if (tone === "loading") toast.loading(message, common);
    else toast.error(message, { ...common, onDismiss: () => latest.current.onDismiss?.() });
  }, [id, message, actionLabel, dismissible]);
  useEffect(() => () => { toast.dismiss(id); }, [id]);
}
