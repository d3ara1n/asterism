import { useEffect, useRef, type MouseEvent } from "react";
import { toast } from "sonner";
import type { RendererReceipt } from "@asterism/sdk/renderer";
import { errorDisplay } from "../../shared/error-display";
import { getI18n } from "./i18n";

export { toast };

/** 操作入口消费本次回执；失败即时提示，不存入会话或其他对象的状态。 */
export function operationSucceeded(result: RendererReceipt): boolean {
  if (!result.ok) toast.error(getI18n().text(errorDisplay(result.error)));
  return result.ok;
}

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
