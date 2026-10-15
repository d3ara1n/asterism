import { useEffect, useRef, type MouseEvent } from "react";
import { toast } from "sonner";

export { toast };

export interface ToastAction { label: string; onClick: () => void }

/**
 * 由状态驱动的持续通知：message 存在时显示，清除时撤下，不自动消失。
 * 提供 onDismiss 的错误通知可关闭，关闭回写状态；操作按钮不关闭通知，由状态变化撤下。
 * 进行中通知不可关闭，只能经操作（如取消）结束。
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
