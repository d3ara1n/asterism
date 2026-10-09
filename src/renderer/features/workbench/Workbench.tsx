import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { ReactFlow, Background, BackgroundVariant, Panel, useReactFlow, applyNodeChanges, type NodeChange, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize, Minus, Plus, Scan } from "lucide-react";
import type { WorkbenchCommand, WorkbenchSnapshot } from "../../../shared/workbench";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Badge } from "../../shared/ui/badge";
import { useIsland } from "../../shared/weave/Screen";
import { useAppearance, useScheme } from "../appearance/state";
import { s } from "../configuration/state";
import { SessionHistoryPanel } from "../session/History";
import { ObjectNode, type ObjectNodeType } from "./ObjectNode";
import { cardDragHandle } from "./ObjectCard";
import { ObjectsPanel } from "./SidePanel";
import { placeObject, type ResourcePlacement } from "./placement";
import { WorkbenchContext, WorkbenchScope, WorkbenchStore, type WorkbenchEnvironment } from "./context";

const nodeTypes = { object: ObjectNode };
export type PanelKind = "objects" | "history";

/** 标题栏操作经此句柄进入工作台浮岛；面板作为更深浮岛打开，不另建浮层。 */
export interface WorkbenchHandle {
  togglePanel: (kind: PanelKind, origin: HTMLElement | null) => void;
  resourcePlacement: () => ResourcePlacement | null;
}

type Props = WorkbenchEnvironment & { ref?: Ref<WorkbenchHandle> };

/** 工作台根浮岛：投影对象和关系；主代理对话只是对应对象的卡片内容。 */
export function Workbench({ ref, ...environment }: Props) {
  const { session, run, ready, busy, controller, historical } = environment;
  const island = useIsland();
  const host = useRef<HTMLDivElement>(null);
  const [store] = useState(() => new WorkbenchStore());
  const open = useCallback((id: string, label: string, render: () => React.ReactNode, origin: HTMLElement | null) => {
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
  const context = environment;
  useEffect(() => store.set(context), [store, context]);

  return <WorkbenchContext.Provider value={context}>
    <div ref={host} className="overlay-inset relative h-full overflow-hidden rounded-lg bg-background">
      <Canvas session={session} run={run} />
      {historical && <div className="surface-floating absolute bottom-[var(--overlay-inset)] left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap p-1 pl-3 text-sm">
        <span>{t.viewingHistory}</span>
        <Button size="sm" onClick={controller.followCursor}>{t.backToLive}</Button>
      </div>}
      {session.objects.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p className="type-caption">{t.noObjects}</p>
      </div>}
      <Badge variant="outline" role="status" className="absolute left-[var(--overlay-inset)] top-[var(--overlay-inset)] z-10 bg-card text-muted-foreground">
        {busy ? t.statusBusy : ready ? t.statusReady : t.statusUnavailable}
      </Badge>
    </div>
  </WorkbenchContext.Provider>;
}

function Canvas({ session, run }: { session: WorkbenchSnapshot; run: (command: WorkbenchCommand) => Promise<boolean> }) {
  const { canvas } = useAppearance();
  const scheme = useScheme();
  const toNodes = useCallback((): ObjectNodeType[] => session.objects.flatMap(object => {
    // 早期会话可能缺少视图行：按默认可见处理，位置在用户首次移动时保存。
    const view = session.views.find(v => v.objectId === object.id) ?? { position: { x: 48, y: 48 }, hidden: false, collapsed: false };
    if (view.hidden) return [];
    return [{
      id: object.id, type: "object" as const, position: view.position, dragHandle: cardDragHandle,
      data: {
        object, collapsed: view.collapsed,
        onView: patch => { void run({ type: "view.set", sessionId: session.id, objectId: object.id, ...patch }); },
      },
    }];
  }), [session, run]);
  const [nodes, setNodes] = useState<ObjectNodeType[]>(toNodes);
  useEffect(() => {
    setNodes(previous => toNodes().map(node => {
      const current = previous.find(n => n.id === node.id);
      return current ? { ...node, selected: current.selected, ...(current.dragging ? { position: current.position, dragging: true } : {}) } : node;
    }));
  }, [toNodes]);
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
        void run({ type: "view.set", sessionId: session.id, objectId: change.id, position: change.position }).then(saved => { if (!saved) setNodes(toNodes()); });
      }
    }
  }, [run, session.id, toNodes]);
  return <ReactFlow<ObjectNodeType>
    colorMode={scheme} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
    defaultViewport={session.viewport} minZoom={0.1} maxZoom={4}
    nodesDraggable={true} nodesConnectable={false} edgesReconnectable={false}
    deleteKeyCode={null} panOnScroll selectionOnDrag panOnDrag={[1, 2]} zoomOnDoubleClick={false}
    onMoveEnd={(event, viewport) => { if (event) void run({ type: "viewport.set", sessionId: session.id, viewport }); }}
  >
    {canvas !== "none" && <Background color="var(--canvas-grid)" gap={24} size={canvas === "dots" ? 1.5 : canvas === "cross" ? 6 : undefined}
      variant={canvas === "dots" ? BackgroundVariant.Dots : canvas === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Cross} />}
    <ViewControls session={session} run={run} />
  </ReactFlow>;
}

function ViewControls({ session, run }: { session: WorkbenchSnapshot; run: (command: WorkbenchCommand) => Promise<boolean> }) {
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
    ...(agent ? [[s("Focus main agent", "定位主代理"), Scan, () => flow.fitView({ nodes: [{ id: agent.id }], padding: 0.12, maxZoom: 1 })] as const] : []),
  ] as const;
  return <Panel position="bottom-right" className="surface flex flex-col p-0.5">
    {controls.map(([label, Icon, action]) =>
      <Button key={label} variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={() => { void move(action); }}><Icon /></Button>)}
  </Panel>;
}
