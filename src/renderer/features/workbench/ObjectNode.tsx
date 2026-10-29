import { Handle, NodeResizeControl, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { Grip, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { memo, useCallback, useEffect } from "react";

import { maximumCardDimension, type WorkbenchObject } from "../../../shared/workbench";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { defaultConnectionPorts, type ConnectionPort } from "./connections";
import { useWorkbench } from "./context";
import { enterFocus, exitFocus } from "./focus";
import { minimumCardHeight, minimumCardWidth } from "./layout";
import { ObjectActions } from "./ObjectActions";
import { ObjectCard, type ViewPatch } from "./ObjectCard";
import { useObjectView } from "./object-view";
import { useModuleViews } from "../../modules/views";
import { Spinner } from "@asterism-app/ui/ui/spinner";

export type ObjectNodeType = Node<{
  object: WorkbenchObject; collapsed: boolean; expandedHeight: number;
  resizing?: boolean;
  ports?: ConnectionPort[];
  /** Stable callback provided by the workbench, dispatching view changes by object ID. */
  onView: (objectId: string, patch: ViewPatch) => void;
}, "object">;

/**
 * Node shell rendered directly by ReactFlow: maintains only endpoint layout and connection anchors.
 *
 * ReactFlow passes new internal props such as xPos/yPos/dragging on each drag frame; rendering the shell is very lightweight
 * (it renders only Handle), while ObjectNodeContent handles card content and receives only
 * id/data/selected, separated from position props so it does not rerender during dragging.
 *
 * For visual effects during dragging (such as shadows), read dragging in this shell; do not pass
 * position-related props into ObjectNodeContent, or it will resume rerendering every frame.
 */
export const ObjectNode = memo(function ObjectNode({ id, data, selected }: NodeProps<ObjectNodeType>) {
  const ports = data.ports ?? defaultConnectionPorts;
  const updateNodeInternals = useUpdateNodeInternals();
  const portLayout = ports.map(port => `${port.id}:${port.side}:${port.offset}`).join("|");
  // After endpoint count or position changes, refresh connection anchors using the canvas's own measurement mechanism.
  useEffect(() => { updateNodeInternals(id); }, [id, portLayout, updateNodeInternals]);
  return <>
    {/* Loose mode determines direction from the drag origin; the backend projection identifies valid receivers. */}
    {ports.map(port => <Handle key={port.id} id={port.id} type="source"
      position={{ left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom }[port.side]}
      style={port.side === "left" || port.side === "right" ? { top: `${port.offset * 100}%` } : { left: `${port.offset * 100}%` }}
      isConnectable={!data.object.retiring} isConnectableEnd={data.object.receivesLinks} />)}
    {data.object.retiring ? <RetiringObject data={data} /> : <ObjectNodeContent id={id} data={data} selected={selected} />}
  </>;
});

/** Removed resources retain only a status shell while their previous instance finishes work. */
function RetiringObject({ data }: { data: ObjectNodeType["data"] }) {
  const i18n = useI18n();
  const descriptor = useModuleViews().resource(data.object.kind);
  return <ObjectCard title={data.object.title} icon={descriptor.icon} kind={i18n.text(descriptor.label)}
    collapsed={data.collapsed} expandedHeight={data.expandedHeight} resizing={false} selected={false} retiring actions={<Spinner />} onView={() => {}}>
    <div className="flex flex-1 items-center justify-center gap-2 p-4" role="status">
      <p className="type-caption">{i18n.text(objectsMessages.resourceRetiring)}</p>
    </div>
  </ObjectCard>;
}

/**
 * Card content: the workbench owns the frame, and modules provide content through versioned projections; raw data remains viewable when a module is missing.
 * When an object is focused, content moves to the focus island; the card retains view actions and shows only a notice in its content area.
 *
 * Receives only id/data/selected, so the default memo shallow comparison prevents rerenders during dragging;
 * all three props come from application state, unaffected by ReactFlow's internal position props.
 */
const ObjectNodeContent = memo(function ObjectNodeContent({ id, data, selected }: {
  id: string; data: ObjectNodeType["data"]; selected: boolean;
}) {
  const i18n = useI18n();
  const { object, collapsed, onView } = data;
  const { session, run } = useWorkbench();
  const focused = session.focus.objectId === object.id;
  const content = useObjectView(object);
  const onObjectView = useCallback((patch: ViewPatch) => onView(object.id, patch), [onView, object.id]);
  const toggleFocus = () => { void (focused ? exitFocus(run, session.id, object.id) : enterFocus(run, session.id, object.id)); };
  const focusLabel = i18n.text(focused ? objectsMessages.returnToCard : objectsMessages.openInIsland);
  return <>
    <ObjectCard title={object.title} collapsed={collapsed} expandedHeight={data.expandedHeight} resizing={!!data.resizing} selected={!!selected} onView={onObjectView}
      icon={content.icon} kind={content.kind}
      panels={focused ? undefined : content.panels}
      actions={<>{!focused && content.actions}<ObjectActions object={object} appearance={content.view} onView={onObjectView} /></>}
      controls={<IconButton size="icon-xs" label={focusLabel} aria-pressed={focused} data-object-focus="" onClick={toggleFocus}>
        {focused ? <PanelLeftClose /> : <PanelLeftOpen />}
      </IconButton>}>
      {focused
        ? <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="type-caption">{i18n.text(objectsMessages.focusedInIsland)}</p>
          <Button variant="outline" size="sm" onClick={() => { void exitFocus(run, session.id, object.id); }}><PanelLeftClose />{i18n.text(objectsMessages.returnToCard)}</Button>
        </div>
        : content.body}
    </ObjectCard>
    {selected && !collapsed && <div className="contents" title={i18n.text(objectsMessages.resizeCard)}
      onDoubleClick={event => { event.stopPropagation(); onObjectView({ size: null }); }}>
      <NodeResizeControl position="bottom-right"
        className="object-resize-handle nopan" minWidth={content.view.minWidth ?? minimumCardWidth}
        minHeight={content.view.minHeight ?? minimumCardHeight} maxWidth={maximumCardDimension} maxHeight={maximumCardDimension}>
        <Grip className="size-2.5" aria-hidden="true" />
      </NodeResizeControl>
    </div>}
  </>;
});
