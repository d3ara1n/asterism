import { useId, type ReactNode } from "react";
import { Panel, ReactFlow, ReactFlowProvider } from "@xyflow/react";
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

/** Decorative texture stays in screen space, independent of canvas panning and zooming. */
export function WorkbenchBackground() {
  const { canvas } = useAppearance();
  const patternId = useId();
  if (canvas === "none") return null;
  return <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
    <defs>
      <pattern id={patternId} width={24} height={24} patternUnits="userSpaceOnUse">
        {canvas === "dots" ? <circle cx={12} cy={12} r={0.75} fill="var(--canvas-grid)" />
          : <path d={canvas === "lines" ? "M12 0V24M0 12H24" : "M9 12H15M12 9V15"}
            fill="none" stroke="var(--canvas-grid)" strokeWidth={1} />}
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${patternId})`} />
  </svg>;
}

/** The link legend belongs to the host, independently of installed paradigms. */
export function WorkbenchFooter({ children }: { children?: ReactNode }) {
  const i18n = useI18n();
  return <Panel position="bottom-right" className="flex max-w-[calc(100%-2rem)] items-end gap-3" style={{ pointerEvents: "none" }}>
    <p className="type-caption min-w-0 text-right">{i18n.formatMessage(workbenchMessages.linkLegend)}</p>
    {children && <div className="shrink-0">{children}</div>}
  </Panel>;
}
