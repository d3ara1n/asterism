import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { ReactFlow, Background, BackgroundVariant, Panel, useReactFlow, applyNodeChanges, type NodeChange, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize, Minus, Plus, Scan } from "lucide-react";
import type { Command, WorkbenchSnapshot } from "../../../shared/contracts";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Badge } from "../../shared/ui/badge";
import { useIsland } from "../../shared/weave/Screen";
import { useAppearance, useScheme } from "../appearance/state";
import { s } from "../configuration/state";
import { SessionHistoryPanel } from "../conversation/Conversation";
import { sessionController } from "../conversation/registry";
import { ObjectNode, type ObjectNodeType } from "./ObjectNode";
import { cardDragHandle } from "./ObjectCard";
import { ObjectsPanel } from "./SidePanel";
import { placeObject } from "./placement";
import { WorkbenchContext, WorkbenchScope, WorkbenchStore, type WorkbenchEnvironment } from "./context";
import type { NoteCreation } from "./CreateNoteDialog";

const nodeTypes = { object: ObjectNode };
export type PanelKind = "objects" | "history";

/** 标题栏操作经此句柄进入工作台浮岛；面板作为更深浮岛打开，不另建浮层。 */
export interface WorkbenchHandle {
  togglePanel: (kind: PanelKind, origin: HTMLElement | null) => void;
  notePlacement: () => NoteCreation | null;
}

type Props = WorkbenchEnvironment & { ref?: Ref<WorkbenchHandle> };

/** 工作台根浮岛：投影对象和关系；主代理对话只是对应对象的卡片内容。 */
export function Workbench({ ref, ...environment }: Props) {
  const { task, run, ready, busy } = environment;
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
      () => kind === "objects" ? <ObjectsPanel /> : <SessionHistoryPanel controller={sessionController(task.id)} />, origin),
    notePlacement: () => {
      const bounds = host.current?.getBoundingClientRect();
      return bounds ? { taskId: task.id, position: placeObject(task, bounds.width, bounds.height) } : null;
    },
  }), [open, task]);
  // 工作台按会话历史中正在查看的位置重建；游标移动或树变化后重新读取。
  const controller = sessionController(task.id);
  const viewing = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const at = viewing.inspected;
  const seq = viewing.snapshot?.seq ?? 0;
  const cursor = viewing.snapshot?.cursor ?? null;
  useEffect(() => controller.connect(), [controller]);
  useEffect(() => { void run({ type: "workspace.read", session_id: task.id, ...(at ? { at } : {}) }); }, [run, task.id, at, seq, cursor]);
  const context = useMemo(() => environment, [environment]);
  useEffect(() => store.set(context), [store, context]);

  return <WorkbenchContext.Provider value={context}>
    <div ref={host} className="overlay-inset relative h-full overflow-hidden rounded-lg bg-background">
      <Canvas key={task.at ?? "live"} task={task} run={run} />
      {task.at && <div className="surface-floating absolute bottom-[var(--overlay-inset)] left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap p-1 pl-3 text-sm">
        <span>{t.viewingHistory}</span>
        <Button size="sm" onClick={() => controller.inspect(undefined)}>{t.backToLive}</Button>
      </div>}
      {task.objects.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p className="type-caption">{t.noObjects}</p>
      </div>}
      <Badge variant="outline" role="status" className="absolute left-[var(--overlay-inset)] top-[var(--overlay-inset)] z-10 bg-card text-muted-foreground">
        {busy ? t.statusBusy : ready ? t.statusReady : t.statusUnavailable}
      </Badge>
    </div>
  </WorkbenchContext.Provider>;
}

function Canvas({ task, run }: { task: WorkbenchSnapshot; run: (command: Command) => Promise<boolean> }) {
  const { canvas } = useAppearance();
  const scheme = useScheme();
  const toNodes = useCallback((): ObjectNodeType[] => task.objects.flatMap(object => {
    // 早期会话可能缺少视图行：按默认可见处理，位置在用户首次移动时保存。
    const view = task.views.find(v => v.object_id === object.id) ?? { position: { x: 48, y: 48 }, hidden: false, collapsed: false };
    if (view.hidden) return [];
    return [{
      id: object.id, type: "object" as const, position: view.position, dragHandle: cardDragHandle,
      data: {
        object, collapsed: view.collapsed, historical: task.at !== null,
        onView: patch => { void run({ type: "view.set", session_id: task.id, object_id: object.id, ...patch }); },
      },
    }];
  }), [task, run]);
  const [nodes, setNodes] = useState<ObjectNodeType[]>(toNodes);
  useEffect(() => {
    setNodes(previous => toNodes().map(node => {
      const current = previous.find(n => n.id === node.id);
      return current ? { ...node, selected: current.selected, ...(current.dragging ? { position: current.position, dragging: true } : {}) } : node;
    }));
  }, [toNodes]);
  const edges: Edge[] = useMemo(() => task.links.map(binding => ({
    id: `${binding.agent_id}:${binding.resource_id}`, source: binding.resource_id, target: binding.agent_id,
    label: t.readAccess,
    style: { stroke: "var(--primary)" },
    selectable: false, deletable: false,
  })), [task.links]);
  const onNodesChange = useCallback((changes: NodeChange<ObjectNodeType>[]) => {
    setNodes(current => applyNodeChanges(changes, current));
    for (const change of changes) {
      if (change.type === "position" && change.position && change.dragging === false) {
        void run({ type: "view.set", session_id: task.id, object_id: change.id, position: change.position }).then(saved => { if (!saved) setNodes(toNodes()); });
      }
    }
  }, [run, task.id, toNodes]);
  return <ReactFlow<ObjectNodeType>
    colorMode={scheme} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
    defaultViewport={task.viewport} minZoom={0.1} maxZoom={4}
    nodesDraggable={true} nodesConnectable={false} edgesReconnectable={false}
    deleteKeyCode={null} panOnScroll selectionOnDrag panOnDrag={[1, 2]} zoomOnDoubleClick={false}
    onMoveEnd={(event, viewport) => { if (event) void run({ type: "viewport.set", session_id: task.id, viewport }); }}
  >
    {canvas !== "none" && <Background color="var(--canvas-grid)" gap={24} size={canvas === "dots" ? 1.5 : canvas === "cross" ? 6 : undefined}
      variant={canvas === "dots" ? BackgroundVariant.Dots : canvas === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Cross} />}
    <ViewControls task={task} run={run} />
  </ReactFlow>;
}

function ViewControls({ task, run }: { task: WorkbenchSnapshot; run: (command: Command) => Promise<boolean> }) {
  const flow = useReactFlow();
  const move = async (action: () => Promise<boolean>) => {
    await action();
    // 工具栏是明确的用户操作；程序化缩放不产生 DOM event，需显式保存。
    await run({ type: "viewport.set", session_id: task.id, viewport: flow.getViewport() });
  };
  const agent = task.objects.find(object => object.kind === "agent" && !task.views.find(v => v.object_id === object.id)?.hidden);
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
