import type { ReactNode } from "react";
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { useAppearance, useScheme } from "../appearance/state";

/** The workbench surface enters with navigation; content loading does not affect page transitions. */
export function WorkbenchSurface({ children, overlay }: { children?: ReactNode; overlay?: ReactNode }) {
  const scheme = useScheme();
  return <div className="relative h-full overflow-hidden bg-canvas">
    {children ?? <ReactFlowProvider>
      <ReactFlow colorMode={scheme} nodesDraggable={false} nodesConnectable={false}
        elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false}>
        <WorkbenchBackground />
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
