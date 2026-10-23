import { IconButton } from "@atelier/ui/ui/icon-button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@atelier/ui/ui/alert-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode, type Ref } from "react";

import { commonMessages } from "@atelier/ui/messages/common";
import { formsMessages } from "../../messages/forms";
import { useI18n } from "../i18n";
import { useCloseGuard, useIsland } from "./Screen";
import type { IslandWidth } from "./model";

/** 面板浮岛的统一宽度：设置详情、编辑器与插件打开的浮岛共用。 */
export const panelIslandWidth: IslandWidth = { min: 400, grow: 1, max: 620 };

/**
 * 面板浮岛：承担扩展操作的统一载体（编辑器、详情等），非模态、不阻塞其他浮岛。
 * 标题栏固定，内容区单独滚动；主操作与关闭位于标题栏右侧，不设底部操作栏，避免呈现为对话框。
 * 次要操作随内容放在对应分组中。dirty 为 true 时，关闭本浮岛（含上级关闭或替换）先确认放弃修改。
 */
export function IslandPanel({ title, description, action, toolbar, dirty, compact, contentRef, children }: {
  title: string; description?: string; action?: ReactNode; toolbar?: ReactNode; dirty?: boolean;
  compact?: boolean; contentRef?: Ref<HTMLDivElement>; children: ReactNode;
}) {
  const i18n = useI18n();
  const island = useIsland();
  const [asking, setAsking] = useState<((discard: boolean) => void) | null>(null);
  useCloseGuard(dirty ? () => new Promise<boolean>(resolve => setAsking(() => resolve)) : null);
  const answer = (discard: boolean) => { asking?.(discard); setAsking(null); };
  return <div className="island-panel">
    <header className="island-panel-header">
      <div className="min-w-0 flex-1">
        <h2 className="type-section truncate">{title}</h2>
        {description && <p className="type-caption truncate">{description}</p>}
      </div>
      {action}
      <IconButton label={i18n.formatMessage(commonMessages.close)} onClick={() => void island.close()}><X /></IconButton>
    </header>
    {toolbar && <div className="shrink-0 space-y-2 border-b px-3 py-3">{toolbar}</div>}
    <div ref={contentRef} className={`island-panel-content${compact ? " px-2 py-2" : ""}`}>{children}</div>
    <AlertDialog open={asking !== null} onOpenChange={open => { if (!open) answer(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{i18n.formatMessage(formsMessages.discardTitle)}</AlertDialogTitle>
          <AlertDialogDescription>{i18n.formatMessage(formsMessages.discardDescription, { title })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{i18n.formatMessage(formsMessages.keepEditing)}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => answer(true)}>{i18n.formatMessage(formsMessages.discard)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
