import { RendererNavigationProvider, type DropItem } from "@asterism-app/sdk/renderer";
import { ReactFlowProvider, ReactFlow, Panel, useReactFlow, applyNodeChanges, applyEdgeChanges, ConnectionMode, ConnectionLineType, type NodeChange, type EdgeChange, type Edge, type Connection, type IsValidConnection } from "@xyflow/react";
import { Crosshair, Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";

import { maximumViewportZoom, type Point, type WorkbenchSnapshot } from "../../../shared/workbench";
import { accessMessages } from "../../messages/access";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { historyMessages } from "../../messages/history";
import { objectsMessages } from "../../messages/objects";
import { workbenchMessages } from "../../messages/workbench";
import { RendererCatalogProvider } from "../../modules/object-context";
import { useModuleViews } from "../../modules/views";
import { useI18n } from "../../shared/i18n";
import { operationSucceeded } from "../../shared/toast";
import { useIsland } from "../../shared/weave/Screen";
import { useAppearance, useScheme } from "../appearance/state";
import type { DragKind } from "../creation/routing";
import { dropCandidates } from "../creation/routing";
import { dragKinds, snapshotDrop } from "../creation/snapshot";
import type { WorkbenchOperation } from "../session/controller";
import { SessionHistoryPanel } from "../session/History";
import { AccessPanel } from "./AccessPanel";
import { useWorkbenchCanvas, type WorkbenchCanvas } from "./canvas";
import { layoutConnections, samePorts, type ConnectionEdge } from "./connections";
import { handleSizeVariables, linkEdgeTypes } from "./LinkEdge";
import { WorkbenchScope, WorkbenchContext, useWorkbench, type WorkbenchEnvironment, type WorkbenchStore, type WorkbenchView } from "./context";
import { workbenchNodes } from "./nodes";
import { type ViewPatch } from "./ObjectCard";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { ObjectNode, type ObjectNodeType } from "./ObjectNode";
import { ObjectsPanel } from "./ObjectsPanel";
import { confirmCardSizes, saveCardSize, type SizeIntent } from "./size-intents";
import { WorkbenchBackground } from "./WorkbenchSurface";

const nodeTypes = { object: ObjectNode };
const connectionLineTypes = { default: ConnectionLineType.Bezier, step: ConnectionLineType.Step, smoothstep: ConnectionLineType.SmoothStep };
export type PanelKind = "objects" | "history" | "access";

/** Titlebar actions enter the workbench island through this handle; panels open as deeper islands without separate overlays. */
export interface WorkbenchHandle {
  togglePanel: (kind: PanelKind, origin: HTMLElement | null) => void;
  canvas: WorkbenchCanvas;
}

type DropHandlers = { canDrop(kinds: readonly DragKind[]): boolean; onDropItems(items: readonly DropItem[], origin: Point): void };
type Props = WorkbenchEnvironment & DropHandlers & {
  ref?: Ref<WorkbenchHandle>; onHome(): void; overview?: boolean; active: boolean;
  /** Application-owned environment outlet: deeper islands and the focus island obtain the same environment outside the workbench subtree through it. */ store: WorkbenchStore;
};
type Run = (command: WorkbenchOperation) => Promise<boolean>;
type WorkbenchEdge = Edge<ConnectionEdge["data"]>;

/** Workbench root island: projects peer objects and relationships; agent conversation is only the agent object's card content. */
export function Workbench({ ref, controller, session, ready, run, onHome, store, canDrop, onDropItems, overview, active }: Props) {
  const i18n = useI18n();
  const canvasRef = useRef<WorkbenchCanvas>(null);
  const canvas = useMemo<WorkbenchCanvas>(() => ({
    findPlacement: options => canvasRef.current?.findPlacement(options) ?? null,
    locateObjects: async (ids, options) => { await canvasRef.current?.locateObjects(ids, options); },
    arrange: async () => { await canvasRef.current?.arrange(); },
  }), []);
  // Assemble the environment by field, notifying cards and panel islands only when fields actually change.
  const context = useMemo<WorkbenchView>(
    () => ({ controller, session, ready, run, canvas }),
    [controller, session, ready, run, canvas]);
  const latestContext = useRef(context);
  latestContext.current = context;
  const island = useIsland();
  const open = useCallback((id: string, label: import("@asterism-app/sdk/contracts").UiText, render: () => ReactNode, origin: HTMLElement | null) => {
    if (island.child === id) island.closeChild();
    // Panel islands render outside the workbench subtree and obtain this session's same environment through WorkbenchScope.
    else island.open({ id, label, width: { min: 320, max: 400 }, origin, render: () => <WorkbenchScope store={store} sessionId={session.id}>{render()}</WorkbenchScope> });
  }, [island, store, session.id]);
  useImperativeHandle(ref, () => ({
    togglePanel: (kind, origin) => open(`workbench-${kind}`, ({ objects: i18n.formatMessage(objectsMessages.objects), history: i18n.formatMessage(historyMessages.history), access: i18n.formatMessage(accessMessages.accessLabel) })[kind],
      () => kind === "objects" ? <ObjectsPanel /> : kind === "access" ? <AccessPanel /> : <SessionHistoryPanel controller={controller} />, origin),
    canvas,
  }), [open, canvas, controller]);
  useLayoutEffect(() => store.set(context), [store, context]);
  // On unmount, withdraw the environment written by this workbench so its controller and projection are no longer referenced after leaving the session; exiting islands already have their own environments captured by WorkbenchScope.
  useLayoutEffect(() => () => store.clear(latestContext.current), [store]);

  return <RendererNavigationProvider value={{ home: onHome }}><RendererCatalogProvider ready={ready}><WorkbenchContext.Provider value={context}>
    <div className="relative h-full">
      <ReactFlowProvider><Canvas ref={canvasRef} session={session} run={run} writable={ready} canDrop={canDrop} onDropItems={onDropItems} overview={overview} active={active} /></ReactFlowProvider>
      {session.objects.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p className="type-caption">{i18n.formatMessage(workbenchMessages.emptyHint)}</p>
      </div>}
    </div>
  </WorkbenchContext.Provider></RendererCatalogProvider></RendererNavigationProvider>;
}

function Canvas({ ref, session, run, writable, canDrop, onDropItems, overview, active }: DropHandlers & {
  ref?: Ref<WorkbenchCanvas>; session: WorkbenchSnapshot; run: Run; writable: boolean; overview?: boolean; active: boolean;
}) {
  const i18n = useI18n();
  const flow = useReactFlow();
  const registry = useModuleViews();
  const { controller } = useWorkbench();
  const viewportElement = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);
  const scheme = useScheme();
  const { edgeStyle } = useAppearance();
  // Callbacks read the latest session through refs while retaining stable identities, avoiding rebuilding every node on each snapshot update.
  const latest = useRef(session);
  latest.current = session;
  const pendingSizes = useRef(new Map<string, SizeIntent>());
  const onView = useCallback((objectId: string, patch: ViewPatch) => {
    const command = { type: "view.set" as const, sessionId: latest.current.id, objectId, ...patch };
    if (patch.size === undefined) { void run(command); return; }
    void saveCardSize({
      pending: pendingSizes.current, objectId, size: patch.size,
      saveAndRead: async () => operationSucceeded(await controller.execute(command)),
      read: () => {
        const state = controller.getSnapshot();
        return state.status === "ready" ? state.data?.workbench ?? null : null;
      },
      project: snapshot => setNodes(previous =>
        workbenchNodes(snapshot ?? latest.current, previous, registry, onView, pendingSizes.current)),
    });
  }, [run, registry, controller]);
  const toNodes = useCallback((snapshot: WorkbenchSnapshot, previous: ObjectNodeType[]) =>
    workbenchNodes(snapshot, previous, registry, onView, pendingSizes.current), [registry, onView]);
  const [nodes, setNodes] = useState<ObjectNodeType[]>(() => toNodes(session, []));
  useEffect(() => {
    confirmCardSizes(pendingSizes.current, session);
    setNodes(previous => toNodes(session, previous));
  }, [session, toNodes]);
  const { api: canvas, minZoom } = useWorkbenchCanvas(nodes, setNodes, viewportElement, active);
  // On template entry, frame the initially visible objects; calculate the viewport for the current window and save through the shared positioning entry.
  const [initialObjects, setInitialObjects] = useState(() => overview ? nodes.filter(node => !node.hidden).map(node => node.id) : []);
  useEffect(() => {
    if (writable && active && initialObjects.length) {
      void canvas.locateObjects(initialObjects);
      setInitialObjects([]);
    }
  }, [canvas, writable, active, initialObjects]);
  useImperativeHandle(ref, () => canvas, [canvas]);
  const connections = useMemo(() => layoutConnections(nodes, session.links), [nodes, session.links]);
  // Reuse previous data when endpoints are unchanged, so dragging one card does not rerender other cards' content each frame.
  const nodeData = useRef(new Map<string, ObjectNodeType["data"]>());
  const canvasNodes = useMemo(() => {
    const cache = nodeData.current;
    const next = new Map<string, ObjectNodeType["data"]>();
    const result = nodes.map(node => {
      const ports = connections.ports.get(node.id);
      const expandedHeight = node.height ?? node.data.expandedHeight;
      const resizing = !!node.resizing;
      const previous = cache.get(node.id);
      const data = previous && previous.object === node.data.object && previous.collapsed === node.data.collapsed
        && previous.expandedHeight === expandedHeight && previous.resizing === resizing
        && previous.onView === node.data.onView && samePorts(previous.ports, ports)
        ? previous : { ...node.data, expandedHeight, resizing, ports };
      next.set(node.id, data);
      // Cards drive visible height; React Flow measures the actual shell and updates endpoints, while target height is passed only to cards.
      return { ...node, height: undefined, data };
    });
    nodeData.current = next;
    return result;
  }, [nodes, connections]);
  // Snapshots determine connections, while selection stays local; otherwise controlled connections can never be selected and Delete cannot work.
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(new Set());
  const edges: WorkbenchEdge[] = useMemo(() => connections.edges.map(edge => ({
    ...edge, type: edgeStyle, selected: selectedEdges.has(edge.id),
    selectable: writable, deletable: writable, interactionWidth: 16,
  })), [connections, writable, selectedEdges, edgeStyle]);
  const onEdgesChange = useCallback((changes: EdgeChange<WorkbenchEdge>[]) => {
    setSelectedEdges(previous => {
      const next = new Set(applyEdgeChanges(changes, edges).filter(e => e.selected).map(e => e.id));
      return next.size === previous.size && [...next].every(id => previous.has(id)) ? previous : next;
    });
  }, [edges]);
  const objects = useMemo(() => new Map(session.objects.map(o => [o.id, o])), [session.objects]);
  // The backend projects link reception; the source can be any other object.
  const isValidConnection: IsValidConnection = useCallback(({ source, target }) =>
    !!source && !!target && source !== target
    && objects.get(target)?.receivesLinks === true
    && !session.links.some(link => link.receiverId === target && link.resourceId === source),
  [objects, session.links]);
  const onConnect = useCallback((c: Connection) => {
    void run({ type: "link.set", sessionId: latest.current.id, receiverId: c.target, resourceId: c.source, linked: true });
  }, [run]);
  const onEdgesDelete = useCallback((removed: WorkbenchEdge[]) => {
    // A merged connection carries the directed relationships it represents; deleting it entirely unlinks each one, while the backend still records separate events.
    for (const edge of removed) for (const link of edge.data?.links ?? []) {
      void run({ type: "link.set", sessionId: latest.current.id, ...link, linked: false });
    }
  }, [run]);
  // Dropped content: capture a synchronous snapshot on drop, then hand it to the host creation coordinator for arbitration.
  const onDrop = (event: React.DragEvent) => {
    setDropping(false);
    if (!writable || !canDrop(dragKinds(event.dataTransfer))) return;
    event.preventDefault();
    const items = snapshotDrop(event.dataTransfer);
    if (items.length) onDropItems(items, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };
  const onNodesChange = useCallback((changes: NodeChange<ObjectNodeType>[]) => {
    setNodes(current => applyNodeChanges(changes, current));
    for (const change of changes) {
      if (change.type === "dimensions" && change.resizing === false && change.dimensions) {
        onView(change.id, { size: change.dimensions });
      }
      if (change.type === "position" && change.position && change.dragging === false) {
        void run({ type: "view.set", sessionId: latest.current.id, objectId: change.id, position: change.position }).then(saved => {
          // On failure, roll back to the latest snapshot rather than the old position at drag start.
          if (!saved) setNodes(previous => toNodes(latest.current, previous.map(n => ({ ...n, dragging: false }))));
        });
      }
    }
  }, [run, toNodes, onView]);
  return <div ref={viewportElement} className="relative h-full outline-none" onDragOver={event => { if (writable && canDrop(dragKinds(event.dataTransfer))) { event.preventDefault(); setDropping(true); } }}
    tabIndex={-1}
    onPaste={event => {
      if (!writable || event.defaultPrevented || (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable=true]"))) return;
      const items = snapshotDrop(event.clipboardData).filter(item => item.kind === "file" && !item.path && dropCandidates(registry.creations, item).length > 0);
      if (!items.length) return;
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      onDropItems(items, flow.screenToFlowPosition({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }));
    }}
    onDragLeave={event => { if (event.currentTarget === event.target) setDropping(false); }} onDrop={onDrop}>
  {dropping && <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
    <p className="type-body">{i18n.formatMessage(workbenchMessages.dropHint)}</p></div>}
  <ReactFlow<ObjectNodeType, WorkbenchEdge>
    colorMode={scheme} style={handleSizeVariables} nodes={canvasNodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={linkEdgeTypes} onNodesChange={onNodesChange}
    defaultViewport={session.viewport} minZoom={minZoom} maxZoom={maximumViewportZoom}
    nodesDraggable nodesConnectable={writable} connectionMode={ConnectionMode.Loose} edgesReconnectable={false} isValidConnection={isValidConnection}
    connectionLineType={connectionLineTypes[edgeStyle]}
    onConnect={onConnect} onEdgesChange={onEdgesChange} onEdgesDelete={onEdgesDelete}
    onBeforeDelete={async ({ edges }) => ({ nodes: [], edges: edges.filter(edge => edge.selected) })}
    deleteKeyCode={writable ? ["Backspace", "Delete"] : null} panOnScroll selectionOnDrag panOnDrag={[1, 2]} zoomOnDoubleClick={false}
    onMoveEnd={(event, viewport) => { if (event) void run({ type: "viewport.set", sessionId: session.id, viewport }); }}
  >
    <WorkbenchBackground />
    <ViewControls session={session} run={run} canvas={canvas} objects={nodes.map(node => node.id)} selected={nodes.filter(node => node.selected).map(node => node.id)} />
  </ReactFlow></div>;
}

function ViewControls({ session, run, canvas, objects, selected }: { session: WorkbenchSnapshot; run: Run; canvas: WorkbenchCanvas; objects: string[]; selected: string[] }) {
  const i18n = useI18n();
  const flow = useReactFlow();
  const move = async (action: () => Promise<boolean>) => {
    await action();
    // Toolbar actions are explicit user operations; programmatic zoom produces no DOM event and must be saved explicitly.
    await run({ type: "viewport.set", sessionId: session.id, viewport: flow.getViewport() });
  };
  // All objects are peers: locate the currently selected cards rather than a “main” agent.
  const controls = [
    [i18n.formatMessage(commonMessages.zoomIn), Plus, () => move(() => flow.zoomIn())],
    [i18n.formatMessage(commonMessages.resetZoom), RotateCcw, () => move(() => flow.zoomTo(1))],
    [i18n.formatMessage(commonMessages.zoomOut), Minus, () => move(() => flow.zoomOut())],
    [i18n.formatMessage(commonMessages.fitObjects), Maximize, () => canvas.locateObjects(objects)],
    ...(selected.length ? [[i18n.formatMessage(objectsMessages.focusSelection), Crosshair, () => canvas.locateObjects(selected)] as const] : []),
  ] as const;
  return <Panel position="bottom-right" className="surface flex flex-col p-0.5">
    {controls.map(([label, Icon, action], index) =>
      <IconButton key={index} label={label} onClick={() => { void action(); }}><Icon /></IconButton>)}
  </Panel>;
}
