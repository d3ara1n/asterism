import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { t } from "../i18n";
import { useIsland } from "./Screen";

/**
 * 面板浮岛：承担扩展操作的统一载体（编辑器、详情等），非模态、不阻塞其他浮岛。
 * 标题栏固定，内容区单独滚动；主操作与关闭位于标题栏右侧，不设底部操作栏，避免呈现为对话框。
 * 次要操作随内容放在对应分组中。
 */
export function IslandPanel({ title, description, action, children }: {
  title: string; description?: string; action?: ReactNode; children: ReactNode;
}) {
  const island = useIsland();
  return <div className="island-panel">
    <header className="island-panel-header">
      <div className="min-w-0 flex-1">
        <h2 className="type-section truncate">{title}</h2>
        {description && <p className="type-caption truncate">{description}</p>}
      </div>
      {action}
      <Button variant="ghost" size="icon-sm" aria-label={t.close} title={t.close} onClick={() => void island.close()}><X /></Button>
    </header>
    <div className="island-panel-content">{children}</div>
  </div>;
}
