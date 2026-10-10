import type { WorkbenchOperation } from "../session/controller";
import { useCallback, useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Panel, useReactFlow, getViewportForBounds, applyNodeChanges, applyEdgeChanges, type NodeChange, type EdgeChange, type Edge, MarkerType, ConnectionMode, type Connection, type IsValidConnection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Crosshair, Maximize, Minus, Plus } from "lucide-react";
import type { WorkbenchSnapshot } from "../../../shared/workbench";
import { useModuleViews } from "../../modules/views";
import { t } from "../../shared/i18n";
import { s } from "../configuration/state";
import { Button } from "../../shared/ui/button";
import { Badge } from "../../shared/ui/badge";
import { useIsland } from "../../shared/weave/Screen";
import { useAppearance, useScheme } from "../appearance/state";
import { SessionHistoryPanel } from "../session/History";
import { ObjectNode, type ObjectNodeType } from "./ObjectNode";
import { IconAction, type ViewPatch } from "./ObjectCard";
import { ObjectsPanel } from "./ObjectsPanel";
import { AccessPanel } from "./AccessPanel";
import { placeObject, type ResourcePlacement } from "./placement";
import { workbenchNodes } from "./nodes";
import { confirmCardSizes, saveCardSize, type SizeIntent } from "./size-intents";
import { layoutConnections, type ConnectionEdge } from "./connections";
import { WorkbenchContext, WorkbenchScope, WorkbenchStore, useWorkbench, type WorkbenchEnvironment, type WorkbenchView } from "./context";

const nodeTypes = { object: ObjectNode };
export type PanelKind = "objects" | "history" | "access";
type LocateRequest = { objectId: string; token: number; navigationVersion: number };

/** 标题栏操作经此句柄进入工作台浮岛；面板作为更深浮岛打开，不另建浮层。 */
export interface WorkbenchHandle {
  togglePanel: (kind: PanelKind, origin: HTMLElement | null) => void;
  resourcePlacement: () => ResourcePlacement | null;
}

type Props = WorkbenchEnvironment & { ref?: Ref<WorkbenchHandle> };
type Run = (command: WorkbenchOperation) => Promise<boolean>;
type WorkbenchEdge = Edge<ConnectionEdge["data"]>;
type CanvasHandle = { place: (width: number, height: number) => ResourcePlacement["position"] };

/** 工作台根浮岛：投影平级对象和关系；代理对话只是代理对象的卡片内容。 */
export function Workbench({ ref, controller, session, ready, busy, historical, run, draft, onDraftChange, onHome }: Props) {
  const [locating, setLocating] = useState<LocateRequest | null>(null);
  const locateSequence = useRef(0);
  const navigationVersion = controller.getSnapshot().navigationVersion;
  useLayoutEffect(() => { locateSequence.current++; setLocating(null); }, [navigationVersion]);
  useLayoutEffect(() => {
    if (!ready || busy) { locateSequence.current++; setLocating(null); }
  }, [ready, busy]);
  const locate = useCallback(async (objectId: string) => {
    const state = controller.getSnapshot();
    if (state.status !== "ready" || !state.snapshot?.workbench.objects.some(object => object.id === objectId)) return;
    const token = ++locateSequence.current;
    if (state.snapshot.workbench.views.some(view => view.objectId === objectId && view.hidden)) {
      if (!(await controller.executeAndRead({ type: "view.set", sessionId: session.id, objectId, hidden: false })).ok) return;
    }
    // 命令受理与投影发布分离；后续由画布等待节点测量。导航变化或新定位意图取消旧意图。
    if (locateSequence.current === token && controller.getSnapshot().status === "ready" && controller.getSnapshot().navigationVersion === state.navigationVersion) {
      setLocating({ objectId, token, navigationVersion: state.navigationVersion });
    }
  }, [controller, session.id]);
  // 按字段组装环境，只有字段真的变化时才通知卡片与面板浮岛。
  const context = useMemo<WorkbenchView>(
    () => ({ controller, session, ready, busy, historical, run, draft, onDraftChange, onHome, locate }),
    [controller, session, ready, busy, historical, run, draft, onDraftChange, onHome, locate]);
  const island = useIsland();
  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const [store] = useState(() => new WorkbenchStore());
  const open = useCallback((id: string, label: string, render: () => ReactNode, origin: HTMLElement | null) => {
    if (island.child === id) island.closeChild();
    // 面板浮岛在工作台子树之外渲染，经 WorkbenchScope 取得同一份环境。
    else island.open({ id, label, width: { min: 320, max: 400 }, origin, render: () => <WorkbenchScope store={store}>{render()}</WorkbenchScope> });
  }, [island, store]);
  useImperativeHandle(ref, () => ({
    togglePanel: (kind, origin) => open(`workbench-${kind}`, ({ objects: t.objects, history: t.history, access: t.accessLabel })[kind],
      () => kind === "objects" ? <ObjectsPanel /> : kind === "access" ? <AccessPanel /> : <SessionHistoryPanel controller={controller} />, origin),
    resourcePlacement: () => {
      const bounds = host.current?.getBoundingClientRect();
      return bounds && canvasRef.current ? { sessionId: session.id, position: canvasRef.current.place(bounds.width, bounds.height) } : null;
    },
  }), [open, session, controller]);
  useLayoutEffect(() => store.set(context), [store, context]);

  return <WorkbenchContext.Provider value={context}>
    <div ref={host} className="overlay-inset relative h-full overflow-hidden rounded-lg bg-background">
      <ReactFlowProvider><Canvas ref={canvasRef} session={session} run={run} writable={ready && !busy && !historical}
        locating={ready && !busy && locating?.navigationVersion === navigationVersion ? locating : null} /></ReactFlowProvider>
      {historical && <div role="status"
        className="surface-floating absolute bottom-[var(--overlay-inset)] left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap p-1 pl-3 text-sm">
        <span>{t.viewingHistory}</span>
        <Button size="sm" onClick={controller.followCursor}>{t.backToLive}</Button>
      </div>}
      {session.objects.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p className="type-caption">{s("Use Add, or drop folders here.", "使用「添加」，或把文件夹拖到这里。")}</p>
      </div>}
      {/* 忙碌/就绪频繁切换不播报；仅不可用时作为提示。 */}
      <Badge variant="outline" role={!busy && !ready ? "alert" : undefined}
        className="absolute left-[var(--overlay-inset)] top-[var(--overlay-inset)] z-10 bg-card text-muted-foreground">
        {busy ? t.statusBusy : ready ? t.statusReady : t.statusUnavailable}
      </Badge>
    </div>
  </WorkbenchContext.Provider>;
}

function Canvas({ ref, session, run, writable, locating }: {
  ref?: Ref<CanvasHandle>; session: WorkbenchSnapshot; run: Run; writable: boolean; locating: LocateRequest | null;
}) {
  const flow = useReactFlow();
  const registry = useModuleViews();
  const { controller } = useWorkbench();
  const viewportElement = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);
  const { canvas } = useAppearance();
  const scheme = useScheme();
  // 回调经 ref 读取最新会话，保持稳定身份，避免每次快照更新重建所有节点。
  const latest = useRef(session);
  latest.current = session;
  const pendingSizes = useRef(new Map<string, SizeIntent>());
  const onView = useCallback((objectId: string, patch: ViewPatch) => {
    const command = { type: "view.set" as const, sessionId: latest.current.id, objectId, ...patch };
    if (patch.size === undefined) { void run(command); return; }
    void saveCardSize({
      pending: pendingSizes.current, objectId, size: patch.size,
      saveAndRead: async () => (await controller.executeAndRead(command)).ok,
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
  useImperativeHandle(ref, () => ({
    place: (width, height) => placeObject(latest.current, width, height, flow.getNodes()),
  }), [flow]);
  const located = useRef(0);
  const target = nodes.find(node => node.id === locating?.objectId);
  useEffect(() => {
    if (!locating || located.current === locating.token || !target?.measured?.width || !target.measured.height) return;
    let active = true, animating = false;
    const frame = requestAnimationFrame(() => {
      const element = viewportElement.current;
      if (!element?.clientWidth || !element.clientHeight) return;
      located.current = locating.token;
      setNodes(current => current.map(node => ({ ...node, selected: node.id === locating.objectId })));
      animating = true;
      const bounds = flow.getNodesBounds([locating.objectId]);
      const viewport = getViewportForBounds(bounds, element.clientWidth, element.clientHeight, 0.1, 1, 0.25);
      // 节点已测量，使用画布公开 API 立即开始可中断的视口过渡。
      void flow.setViewport(viewport, {
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420 }).then(() => {
        animating = false;
        if (!active || controller.getSnapshot().navigationVersion !== locating.navigationVersion) return;
        // 定位属于显式视图操作；不追加会话历史。
        void run({ type: "viewport.set", sessionId: session.id, viewport: flow.getViewport() });
      });
    });
    return () => {
      active = false; cancelAnimationFrame(frame);
      // 即时设置当前视口会中断画布原生过渡，导航后不再继续移动或保存旧定位。
      if (animating) void flow.setViewport(flow.getViewport(), { duration: 0 });
    };
  }, [locating, target?.measured?.width, target?.measured?.height, flow, run, session.id, controller]);
  const connections = useMemo(() => layoutConnections(nodes, session.links), [nodes, session.links]);
  const canvasNodes = useMemo(() => nodes.map(node => ({
    ...node, data: { ...node.data, ports: connections.ports.get(node.id) },
  })), [nodes, connections]);
  // 连线由快照决定，选中状态留在本地；否则受控连线永远选不中，Delete 无从生效。
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(new Set());
  const edges: WorkbenchEdge[] = useMemo(() => connections.edges.map(edge => ({
    ...edge, selected: selectedEdges.has(edge.id),
    style: { stroke: "var(--primary)", strokeWidth: selectedEdges.has(edge.id) ? 2.5 : 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--primary)" },
    markerStart: edge.data.links.length === 2 ? { type: MarkerType.ArrowClosed, color: "var(--primary)", orient: "auto-start-reverse" } : undefined,
    selectable: writable, deletable: writable, interactionWidth: 16,
  })), [connections, writable, selectedEdges]);
  const onEdgesChange = useCallback((changes: EdgeChange<WorkbenchEdge>[]) => {
    setSelectedEdges(previous => {
      const next = new Set(applyEdgeChanges(changes, edges).filter(e => e.selected).map(e => e.id));
      return next.size === previous.size && [...next].every(id => previous.has(id)) ? previous : next;
    });
  }, [edges]);
  const objects = useMemo(() => new Map(session.objects.map(o => [o.id, o])), [session.objects]);
  // 终点只能是代理；起点是任意其他对象，含另一个代理。
  const isValidConnection: IsValidConnection = useCallback(c => !!c.source && !!c.target && c.source !== c.target
    && objects.get(c.target)?.kind === "agent" && !session.links.some(l => l.agentId === c.target && l.resourceId === c.source), [objects, session.links]);
  const onConnect = useCallback((c: Connection) => {
    void run({ type: "link.set", sessionId: latest.current.id, agentId: c.target, resourceId: c.source, linked: true });
  }, [run]);
  const onEdgesDelete = useCallback((removed: WorkbenchEdge[]) => {
    // 合并线携带其代表的有向关系；整条删除时逐一解除，后端仍分别记录事件。
    for (const edge of removed) for (const link of edge.data?.links ?? []) {
      void run({ type: "link.set", sessionId: latest.current.id, ...link, linked: false });
    }
  }, [run]);
  // 拖入文件夹：主进程只接收绝对路径，由目录模块校验是否为已存在目录。
  const onDrop = (event: React.DragEvent) => {
    setDropping(false);
    if (!writable || !event.dataTransfer.files.length) return;
    event.preventDefault();
    const origin = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    [...event.dataTransfer.files].forEach((file, index) => {
      const path = window.weft.pathForFile(file);
      if (path) void run({ type: "resource.create", sessionId: latest.current.id, kind: "directory", input: { path },
        position: { x: origin.x + index * 32, y: origin.y + index * 32 } });
    });
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
  return <div ref={viewportElement} className="relative h-full" onDragOver={event => { if (writable && event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDropping(true); } }}
    onDragLeave={event => { if (event.currentTarget === event.target) setDropping(false); }} onDrop={onDrop}>
  {dropping && <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
    <p className="type-body">{s("Drop to add as resources", "松开以添加为资源")}</p></div>}
  <ReactFlow<ObjectNodeType, WorkbenchEdge>
    colorMode={scheme} nodes={canvasNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
    defaultViewport={session.viewport} minZoom={0.1} maxZoom={4}
    nodesDraggable nodesConnectable={writable} connectionMode={ConnectionMode.Loose} edgesReconnectable={false} isValidConnection={isValidConnection}
    onConnect={onConnect} onEdgesChange={onEdgesChange} onEdgesDelete={onEdgesDelete}
    onBeforeDelete={async ({ edges }) => ({ nodes: [], edges: edges.filter(edge => edge.selected) })}
    deleteKeyCode={writable ? ["Backspace", "Delete"] : null} panOnScroll selectionOnDrag panOnDrag={[1, 2]} zoomOnDoubleClick={false}
    onMoveEnd={(event, viewport) => { if (event) void run({ type: "viewport.set", sessionId: session.id, viewport }); }}
  >
    {canvas !== "none" && <Background color="var(--canvas-grid)" gap={24} size={canvas === "dots" ? 1.5 : canvas === "cross" ? 6 : undefined}
      variant={canvas === "dots" ? BackgroundVariant.Dots : canvas === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Cross} />}
    <ViewControls session={session} run={run} selected={nodes.filter(node => node.selected).map(node => ({ id: node.id }))} />
  </ReactFlow></div>;
}

function ViewControls({ session, run, selected }: { session: WorkbenchSnapshot; run: Run; selected: { id: string }[] }) {
  const flow = useReactFlow();
  const move = async (action: () => Promise<boolean>) => {
    await action();
    // 工具栏是明确的用户操作；程序化缩放不产生 DOM event，需显式保存。
    await run({ type: "viewport.set", sessionId: session.id, viewport: flow.getViewport() });
  };
  // 所有对象平级：定位当前选中的卡片，而非某个“主”代理。
  const controls = [
    [t.zoomIn, Plus, () => flow.zoomIn()],
    [t.zoomOut, Minus, () => flow.zoomOut()],
    [t.fitObjects, Maximize, () => flow.fitView({ padding: 0.25 })],
    ...(selected.length ? [[t.focusSelection, Crosshair, () => flow.fitView({ nodes: selected, padding: 0.12, maxZoom: 1 })] as const] : []),
  ] as const;
  return <Panel position="bottom-right" className="surface flex flex-col p-0.5">
    {controls.map(([label, Icon, action]) =>
      <IconAction key={label} label={label} size="icon-sm" onClick={() => { void move(action); }}><Icon /></IconAction>)}
  </Panel>;
}
