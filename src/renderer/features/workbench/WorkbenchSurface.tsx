import type { ReactNode } from "react";
import { Background, BackgroundVariant, Panel, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { useI18n } from "../../shared/i18n";
import { workbenchMessages } from "../../messages/workbench";
import { useAppearance, useScheme } from "../appearance/state";

/** The workbench surface enters with navigation; content loading does not affect page transitions. */
export function WorkbenchSurface({ children, overlay }: { children?: ReactNode; overlay?: ReactNode }) {
  const scheme = useScheme();
  return <div className="relative h-full overflow-hidden bg-canvas">
    {children ?? <ReactFlowProvider>
      <ReactFlow proOptions={{ hideAttribution: true }} colorMode={scheme} nodesDraggable={false} nodesConnectable={false}
        elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false}>
        <WorkbenchBackground />
        <WorkbenchFooter />
      </ReactFlow>
    </ReactFlowProvider>}
    {overlay}
  </div>;
}

/** Use the same canvas texture with or without session content. */
export function WorkbenchBackground() {
  const { canvas } = useAppearance();
  return canvas !== "none" && <Background color="var(--canvas-grid)" gap={24}
    size={canvas === "dots" ? 1.5 : canvas === "cross" ? 6 : undefined}
    variant={canvas === "dots" ? BackgroundVariant.Dots : canvas === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Cross} />;
}

/** The link legend belongs to the host, independently of installed paradigms. */
export function WorkbenchFooter({ children }: { children?: ReactNode }) {
  const i18n = useI18n();
  return <Panel position="bottom-right" className="flex max-w-[calc(100%-2rem)] flex-col items-end gap-2" style={{ pointerEvents: "none" }}>
    {children}
    <p className="type-caption text-right">{i18n.formatMessage(workbenchMessages.linkLegend)}</p>
  </Panel>;
}
