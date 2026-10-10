import type { ReactNode } from "react";
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAppearance, useScheme } from "../appearance/state";

/** 工作台底板随导航入场，内容读取不影响页面过渡。 */
export function WorkbenchSurface({ children, overlay }: { children?: ReactNode; overlay?: ReactNode }) {
  const scheme = useScheme();
  return <div className="overlay-inset relative h-full overflow-hidden rounded-lg bg-background">
    {children ?? <ReactFlowProvider>
      <ReactFlow colorMode={scheme} nodesDraggable={false} nodesConnectable={false}
        elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false}>
        <WorkbenchBackground />
      </ReactFlow>
    </ReactFlowProvider>}
    {overlay}
  </div>;
}

/** 有无会话内容时共用同一套画布纹理。 */
export function WorkbenchBackground() {
  const { canvas } = useAppearance();
  return canvas !== "none" && <Background color="var(--canvas-grid)" gap={24}
    size={canvas === "dots" ? 1.5 : canvas === "cross" ? 6 : undefined}
    variant={canvas === "dots" ? BackgroundVariant.Dots : canvas === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Cross} />;
}
