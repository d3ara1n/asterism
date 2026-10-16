import { IconButton } from "@atelier/ui/ui/icon-button";
import { X } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { commonMessages } from "@atelier/ui/messages/common";
import { useI18n } from "../i18n";
import { useIsland } from "./Screen";

/**
 * 面板浮岛：承担扩展操作的统一载体（编辑器、详情等），非模态、不阻塞其他浮岛。
 * 标题栏固定，内容区单独滚动；主操作与关闭位于标题栏右侧，不设底部操作栏，避免呈现为对话框。
 * 次要操作随内容放在对应分组中。
 */
export function IslandPanel({ title, description, action, toolbar, compact, contentRef, children }: {
  title: string; description?: string; action?: ReactNode; toolbar?: ReactNode;
  compact?: boolean; contentRef?: Ref<HTMLDivElement>; children: ReactNode;
}) {
  const i18n = useI18n();
  const island = useIsland();
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
  </div>;
}
