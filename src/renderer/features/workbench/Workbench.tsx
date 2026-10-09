import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { ReactFlow, Background, BackgroundVariant, Panel, useReactFlow, applyNodeChanges, type NodeChange, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize, Minus, Plus, Scan } from "lucide-react";
import type { WorkbenchCommand, WorkbenchSnapshot } from "../../../shared/workbench";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Badge } from "../../shared/ui/badge";
import { useIsland } from "../../shared/weave/Screen";
import { useAppearance, useScheme } from "../appearance/state";
import { SessionHistoryPanel } from "../session/History";
import { ObjectNode, type ObjectNodeType } from "./ObjectNode";
import { IconAction, cardDragHandle, type ViewPatch } from "./ObjectCard";
import { ObjectsPanel } from "./ObjectsPanel";
import { placeObject, type ResourcePlacement } from "./placement";
import { defaultCardPosition } from "./layout";
import { WorkbenchContext, WorkbenchScope, WorkbenchStore, type WorkbenchEnvironment } from "./context";

const nodeTypes = { object: ObjectNode };
export type PanelKind = "objects" | "history";

/** 标题栏操作经此句柄进入工作台浮岛；面板作为更深浮岛打开，不另建浮层。 */
export interface WorkbenchHandle {
  togglePanel: (kind: PanelKind, origin: HTMLElement | null) => void;
  resourcePlacement: () => ResourcePlacement | null;
}

type Props = WorkbenchEnvironment & { ref?: Ref<WorkbenchHandle> };
type Run = (command: WorkbenchCommand) => Promise<boolean>;

/** 工作台根浮岛：投影对象和关系；主代理对话只是对应对象的卡片内容。 */
export function Workbench({ ref, controller, session, ready, busy, historical, run, draft, onDraftChange, onHome }: Props) {
  // 按字段组装环境，只有字段真的变化时才通知卡片与面板浮岛。
  const context = useMemo<WorkbenchEnvironment>(
    () => ({ controller, session, ready, busy, historical, run, draft, onDraftChange, onHome }),
    [controller, session, ready, busy, historical, run, draft, onDraftChange, onHome]);
  const island = useIsland();
  const host = useRef<HTMLDivElement>(null);
  const [store] = useState(() => new WorkbenchStore());
  const open = useCallback((id: string, label: string, render: () => ReactNode, origin: HTMLElement | null) => {
    if (island.child === id) island.closeChild();
    // 面板浮岛在工作台子树之外渲染，经 WorkbenchScope 取得同一份环境。
    else island.open({ id, label, width: { min: 288, max: 360 }, origin, render: () => <WorkbenchScope store={store}>{render()}</WorkbenchScope> });
  }, [island, store]);
  useImperativeHandle(ref, () => ({
    togglePanel: (kind, origin) => open(`workbench-${kind}`, kind === "objects" ? t.objects : t.history,
      () => kind === "objects" ? <ObjectsPanel /> : <SessionHistoryPanel controller={controller} />, origin),
    resourcePlacement: () => {
      const bounds = host.current?.getBoundingClientRect();
      return bounds ? { sessionId: session.id, position: placeObject(session, bounds.width, bounds.height) } : null;
    },
  }), [open, session, controller]);
  useEffect(() => store.set(context), [store, context]);

  return <WorkbenchContext.Provider value={context}>
    <div ref={host} className="overlay-inset relative h-full overflow-hidden rounded-lg bg-background">
      <Canvas session={session} run={run} />
      {historical && <div role="status"
        className="surface-floating absolute bottom-[var(--overlay-inset)] left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap p-1 pl-3 text-sm">
        <span>{t.viewingHistory}</span>
        <Button size="sm" onClick={controller.followCursor}>{t.backToLive}</Button>
      </div>}
      {session.objects.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p className="type-caption">{t.noObjects}</p>
      </div>}
      {/* 忙碌/就绪频繁切换不播报；仅不可用时作为提示。 */}
      <Badge variant="outline" role={!busy && !ready ? "alert" : undefined}
        className="absolute left-[var(--overlay-inset)] top-[var(--overlay-inset)] z-10 bg-card text-muted-foreground">
        {busy ? t.statusBusy : ready ? t.statusReady : t.statusUnavailable}
      </Badge>
    </div>
  </WorkbenchContext.Provider>;
}

function Canvas({ session, run }: { session: WorkbenchSnapshot; run: Run }) {
  const { canvas } = useAppearance();
  const scheme = useScheme();
  // 回调经 ref 读取最新会话，保持稳定身份，避免每次快照更新重建所有节点。
  const latest = useRef(session);
  latest.current = session;
  const onView = useCallback((objectId: string, patch: ViewPatch) => {
    void run({ type: "view.set", sessionId: latest.current.id, objectId, ...patch });
  }, [run]);
  const toNodes = useCallback((snapshot: WorkbenchSnapshot, previous: ObjectNodeType[]): ObjectNodeType[] =>
    snapshot.objects.flatMap(object => {
      const view = snapshot.views.find(v => v.objectId === object.id) ?? { position: defaultCardPosition, hidden: false, collapsed: false };
      if (view.hidden) return [];
      const current = previous.find(n => n.id === object.id);
      // 对象与视图状态未变时复用原 data，memo 的卡片跳过重渲染。
      const data = current && current.data.object === object && current.data.collapsed === view.collapsed
        ? current.data : { object, collapsed: view.collapsed, onView };
      const node: ObjectNodeType = { id: object.id, type: "object", position: view.position, dragHandle: cardDragHandle, data };
      if (!current) return [node];
      return [{ ...node, selected: current.selected, ...(current.dragging ? { position: current.position, dragging: true } : {}) }];
    }), [onView]);
  const [nodes, setNodes] = useState<ObjectNodeType[]>(() => toNodes(session, []));
  useEffect(() => { setNodes(previous => toNodes(session, previous)); }, [session, toNodes]);
  const edges: Edge[] = useMemo(() => session.links.map(binding => ({
    id: `${binding.agentId}:${binding.resourceId}`, source: binding.resourceId, target: binding.agentId,
    label: t.readAccess,
    style: { stroke: "var(--primary)" },
    selectable: false, deletable: false,
  })), [session.links]);
  const onNodesChange = useCallback((changes: NodeChange<ObjectNodeType>[]) => {
    setNodes(current => applyNodeChanges(changes, current));
    for (const change of changes) {
      if (change.type === "position" && change.position && change.dragging === false) {
        void run({ type: "view.set", sessionId: latest.current.id, objectId: change.id, position: change.position }).then(saved => {
          // 失败时按最新快照回滚，而非拖动开始时的旧位置。
          if (!saved) setNodes(previous => toNodes(latest.current, previous.map(n => ({ ...n, dragging: false }))));
        });
      }
    }
  }, [run, toNodes]);
  return <ReactFlow<ObjectNodeType>
    colorMode={scheme} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
    defaultViewport={session.viewport} minZoom={0.1} maxZoom={4}
    nodesDraggable nodesConnectable={false} edgesReconnectable={false}
    deleteKeyCode={null} panOnScroll selectionOnDrag panOnDrag={[1, 2]} zoomOnDoubleClick={false}
    onMoveEnd={(event, viewport) => { if (event) void run({ type: "viewport.set", sessionId: session.id, viewport }); }}
  >
    {canvas !== "none" && <Background color="var(--canvas-grid)" gap={24} size={canvas === "dots" ? 1.5 : canvas === "cross" ? 6 : undefined}
      variant={canvas === "dots" ? BackgroundVariant.Dots : canvas === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Cross} />}
    <ViewControls session={session} run={run} />
  </ReactFlow>;
}

function ViewControls({ session, run }: { session: WorkbenchSnapshot; run: Run }) {
  const flow = useReactFlow();
  const move = async (action: () => Promise<boolean>) => {
    await action();
    // 工具栏是明确的用户操作；程序化缩放不产生 DOM event，需显式保存。
    await run({ type: "viewport.set", sessionId: session.id, viewport: flow.getViewport() });
  };
  const agent = session.objects.find(object => object.kind === "agent" && !session.views.find(v => v.objectId === object.id)?.hidden);
  const controls = [
    [t.zoomIn, Plus, () => flow.zoomIn()],
    [t.zoomOut, Minus, () => flow.zoomOut()],
    [t.fitObjects, Maximize, () => flow.fitView({ padding: 0.25 })],
    ...(agent ? [[t.focusMainAgent, Scan, () => flow.fitView({ nodes: [{ id: agent.id }], padding: 0.12, maxZoom: 1 })] as const] : []),
  ] as const;
  return <Panel position="bottom-right" className="surface flex flex-col p-0.5">
    {controls.map(([label, Icon, action]) =>
      <IconAction key={label} label={label} size="icon-sm" onClick={() => { void move(action); }}><Icon /></IconAction>)}
  </Panel>;
}
