import { RendererNavigationProvider, type DropItem } from "@atelier/sdk/renderer";
import { ReactFlowProvider, ReactFlow, Panel, useReactFlow, applyNodeChanges, applyEdgeChanges, MarkerType, ConnectionMode, ConnectionLineType, type NodeChange, type EdgeChange, type Edge, type Connection, type IsValidConnection } from "@xyflow/react";
import { Crosshair, Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";

import { maximumViewportZoom, type Point, type WorkbenchSnapshot } from "../../../shared/workbench";
import { accessMessages } from "../../messages/access";
import { commonMessages } from "@atelier/ui/messages/common";
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
import { layoutConnections, type ConnectionEdge } from "./connections";
import { WorkbenchScope, WorkbenchContext, useWorkbench, type WorkbenchEnvironment, type WorkbenchStore, type WorkbenchView } from "./context";
import { workbenchNodes } from "./nodes";
import { type ViewPatch } from "./ObjectCard";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { ObjectNode, type ObjectNodeType } from "./ObjectNode";
import { ObjectsPanel } from "./ObjectsPanel";
import { confirmCardSizes, saveCardSize, type SizeIntent } from "./size-intents";
import { WorkbenchBackground } from "./WorkbenchSurface";

const nodeTypes = { object: ObjectNode };
const connectionLineTypes = { default: ConnectionLineType.Bezier, step: ConnectionLineType.Step, smoothstep: ConnectionLineType.SmoothStep };
export type PanelKind = "objects" | "history" | "access";

/** 标题栏操作经此句柄进入工作台浮岛；面板作为更深浮岛打开，不另建浮层。 */
export interface WorkbenchHandle {
  togglePanel: (kind: PanelKind, origin: HTMLElement | null) => void;
  canvas: WorkbenchCanvas;
}

type DropHandlers = { canDrop(kinds: readonly DragKind[]): boolean; onDropItems(items: readonly DropItem[], origin: Point): void };
type Props = WorkbenchEnvironment & DropHandlers & {
  ref?: Ref<WorkbenchHandle>; onHome(): void;
  /** 应用持有的环境出口：更深浮岛与聚焦浮岛在工作台子树之外经它取得同一份环境。 */ store: WorkbenchStore;
};
type Run = (command: WorkbenchOperation) => Promise<boolean>;
type WorkbenchEdge = Edge<ConnectionEdge["data"]>;

/** 工作台根浮岛：投影平级对象和关系；代理对话只是代理对象的卡片内容。 */
export function Workbench({ ref, controller, session, ready, busy, run, onHome, store, canDrop, onDropItems }: Props) {
  const i18n = useI18n();
  const canvasRef = useRef<WorkbenchCanvas>(null);
  const canvas = useMemo<WorkbenchCanvas>(() => ({
    findPlacement: options => canvasRef.current?.findPlacement(options) ?? null,
    locateObjects: async (ids, options) => { await canvasRef.current?.locateObjects(ids, options); },
  }), []);
  // 按字段组装环境，只有字段真的变化时才通知卡片与面板浮岛。
  const context = useMemo<WorkbenchView>(
    () => ({ controller, session, ready, busy, run, canvas }),
    [controller, session, ready, busy, run, canvas]);
  const latestContext = useRef(context);
  latestContext.current = context;
  const island = useIsland();
  const open = useCallback((id: string, label: import("@atelier/sdk/contracts").UiText, render: () => ReactNode, origin: HTMLElement | null) => {
    if (island.child === id) island.closeChild();
    // 面板浮岛在工作台子树之外渲染，经 WorkbenchScope 取得本会话的同一份环境。
    else island.open({ id, label, width: { min: 320, max: 400 }, origin, render: () => <WorkbenchScope store={store} sessionId={session.id}>{render()}</WorkbenchScope> });
  }, [island, store, session.id]);
  useImperativeHandle(ref, () => ({
    togglePanel: (kind, origin) => open(`workbench-${kind}`, ({ objects: i18n.formatMessage(objectsMessages.objects), history: i18n.formatMessage(historyMessages.history), access: i18n.formatMessage(accessMessages.accessLabel) })[kind],
      () => kind === "objects" ? <ObjectsPanel /> : kind === "access" ? <AccessPanel /> : <SessionHistoryPanel controller={controller} />, origin),
    canvas,
  }), [open, canvas, controller]);
  useLayoutEffect(() => store.set(context), [store, context]);
  // 卸载时撤回本工作台写入的环境，离开会话后不再引用其控制器与投影；退场中的浮岛已由 WorkbenchScope 固定各自的环境。
  useLayoutEffect(() => () => store.clear(latestContext.current), [store]);

  return <RendererNavigationProvider value={{ home: onHome }}><RendererCatalogProvider ready={ready}><WorkbenchContext.Provider value={context}>
    <div className="relative h-full">
      <ReactFlowProvider><Canvas ref={canvasRef} session={session} run={run} writable={ready && !busy} canDrop={canDrop} onDropItems={onDropItems} /></ReactFlowProvider>
      {session.objects.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p className="type-caption">{i18n.formatMessage(workbenchMessages.emptyHint)}</p>
      </div>}
    </div>
  </WorkbenchContext.Provider></RendererCatalogProvider></RendererNavigationProvider>;
}

function Canvas({ ref, session, run, writable, canDrop, onDropItems }: DropHandlers & {
  ref?: Ref<WorkbenchCanvas>; session: WorkbenchSnapshot; run: Run; writable: boolean;
}) {
  const i18n = useI18n();
  const flow = useReactFlow();
  const registry = useModuleViews();
  const { controller } = useWorkbench();
  const viewportElement = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);
  const scheme = useScheme();
  const { edgeStyle } = useAppearance();
  // 回调经 ref 读取最新会话，保持稳定身份，避免每次快照更新重建所有节点。
  const latest = useRef(session);
  latest.current = session;
  const pendingSizes = useRef(new Map<string, SizeIntent>());
  const onView = useCallback((objectId: string, patch: ViewPatch) => {
    const command = { type: "view.set" as const, sessionId: latest.current.id, objectId, ...patch };
    if (patch.size === undefined) { void run(command); return; }
    void saveCardSize({
      pending: pendingSizes.current, objectId, size: patch.size,
      saveAndRead: async () => operationSucceeded(await controller.executeAndRead(command)),
      read: () => {
        const state = controller.getSnapshot();
        return state.status === "ready" ? state.snapshot?.workbench ?? null : null;
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
  const { api: canvas, minZoom } = useWorkbenchCanvas(nodes, setNodes, viewportElement);
  useImperativeHandle(ref, () => canvas, [canvas]);
  const connections = useMemo(() => layoutConnections(nodes, session.links), [nodes, session.links]);
  const canvasNodes = useMemo(() => nodes.map(node => ({
    ...node, data: { ...node.data, ports: connections.ports.get(node.id) },
  })), [nodes, connections]);
  // 连线由快照决定，选中状态留在本地；否则受控连线永远选不中，Delete 无从生效。
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(new Set());
  const edges: WorkbenchEdge[] = useMemo(() => connections.edges.map(edge => ({
    ...edge, type: edgeStyle, selected: selectedEdges.has(edge.id),
    style: { stroke: "var(--primary)", strokeWidth: selectedEdges.has(edge.id) ? 2.5 : 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--primary)" },
    markerStart: edge.data.links.length === 2 ? { type: MarkerType.ArrowClosed, color: "var(--primary)", orient: "auto-start-reverse" } : undefined,
    selectable: writable, deletable: writable, interactionWidth: 16,
  })), [connections, writable, selectedEdges, edgeStyle]);
  const onEdgesChange = useCallback((changes: EdgeChange<WorkbenchEdge>[]) => {
    setSelectedEdges(previous => {
      const next = new Set(applyEdgeChanges(changes, edges).filter(e => e.selected).map(e => e.id));
      return next.size === previous.size && [...next].every(id => previous.has(id)) ? previous : next;
    });
  }, [edges]);
  const objects = useMemo(() => new Map(session.objects.map(o => [o.id, o])), [session.objects]);
  // 终点由资源的静态接收声明决定；起点是任意其他对象。
  const isValidConnection: IsValidConnection = useCallback(c => !!c.source && !!c.target && c.source !== c.target
    && !!objects.get(c.target) && registry.resource(objects.get(c.target)!.kind).receivesLinks === true && !session.links.some(l => l.receiverId === c.target && l.resourceId === c.source), [objects, session.links, registry]);
  const onConnect = useCallback((c: Connection) => {
    void run({ type: "link.set", sessionId: latest.current.id, receiverId: c.target, resourceId: c.source, linked: true });
  }, [run]);
  const onEdgesDelete = useCallback((removed: WorkbenchEdge[]) => {
    // 合并线携带其代表的有向关系；整条删除时逐一解除，后端仍分别记录事件。
    for (const edge of removed) for (const link of edge.data?.links ?? []) {
      void run({ type: "link.set", sessionId: latest.current.id, ...link, linked: false });
    }
  }, [run]);
  // 拖入内容：放下时同步快照，再交给宿主创建协调器仲裁。
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
          // 失败时按最新快照回滚，而非拖动开始时的旧位置。
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
    colorMode={scheme} nodes={canvasNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
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
    // 工具栏是明确的用户操作；程序化缩放不产生 DOM event，需显式保存。
    await run({ type: "viewport.set", sessionId: session.id, viewport: flow.getViewport() });
  };
  // 所有对象平级：定位当前选中的卡片，而非某个“主”代理。
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
