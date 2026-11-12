import type { ReactNode, Ref } from "react";
import { X } from "lucide-react";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { cn } from "@asterism-app/ui/utils";
import { useI18n } from "../i18n";

export interface PanelProps {
  title: string;
  description?: string;
  source?: ReactNode;
  action?: ReactNode;
  toolbar?: ReactNode;
  tools?: ReactNode;
  compact?: boolean;
  contentRef?: Ref<HTMLDivElement>;
  layout?: "padded" | "fill";
  onClose: () => void;
  children: ReactNode;
}

/** Shared panel presentation; its owner supplies closing and any container-specific tools. */
export function Panel({ title, description, source, action, toolbar, tools, compact, contentRef, layout = "padded", onClose, children }: PanelProps) {
  const i18n = useI18n();
  return <div className="island-panel">
    <header className="island-panel-header">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          {source && <span className="flex min-w-0 shrink-[2]">{source}</span>}
          <h2 className="type-section min-w-0 truncate">{title}</h2>
        </div>
        {description && <p className="type-caption truncate">{description}</p>}
      </div>
      {action}
      {tools}
      <IconButton label={i18n.formatMessage(commonMessages.close)} onClick={onClose}><X /></IconButton>
    </header>
    {toolbar && <div className="flex shrink-0 flex-col gap-2 border-b px-3 py-3">{toolbar}</div>}
    <div ref={contentRef} data-layout={layout} className={cn("island-panel-content", compact && "px-2 py-2")}>{children}</div>
  </div>;
}
