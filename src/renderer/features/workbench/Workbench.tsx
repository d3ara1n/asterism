import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ReactFlow, Background, BackgroundVariant, Panel, useReactFlow, applyNodeChanges, type NodeChange, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FilePlus2, Link2, Maximize, Minus, Plus, Scan, Shapes } from "lucide-react";
import type { Command, TaskSnapshot } from "../../../shared/contracts";
import { Button } from "../../shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../shared/ui/dropdown-menu";
import { t } from "../../shared/i18n";
import { s } from "../configuration/state";
import { useAppearance, useScheme } from "../appearance/state";
import { ObjectNode, type ObjectNodeType } from "./ObjectNode";
import { CreateNoteDialog, type NoteCreation } from "./CreateNoteDialog";
import { AccessDialog } from "./AccessDialog";

const nodeTypes = { object: ObjectNode };

/** 工作台投影对象和关系；主代理对话只是对应对象的一种卡片内容。 */
export function Workbench({ task, agentId, renderAgent, run, busy }: {
  task: TaskSnapshot; agentId: string; renderAgent: (actions: ReactNode) => ReactNode; run: (command: Command) => Promise<boolean>;
  busy: boolean;
}) {
  const { canvas } = useAppearance();
  const scheme = useScheme();
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 680, height: 640 });
  const [geometry, setGeometry] = useState<ObjectNodeType[]>([]);
  const [initialFit] = useState(() => !task.views.length && task.viewport.x === 0 && task.viewport.y === 0 && task.viewport.zoom === 1);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const resize = () => {
      const width = Math.min(720, Math.max(480, element.clientWidth - 96));
      const height = Math.min(800, Math.max(420, element.clientHeight - 96));
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const nodes = useMemo<ObjectNodeType[]>(() => task.objects.flatMap((object, index) => {
    const view = task.views.find(view => view.object_id === object.id);
    if (view?.hidden) return [];
    const local = geometry.find(node => node.id === object.id);
    const isMainAgent = object.id === agentId;
    return [{
      ...local, id: object.id, type: "object", position: local?.position ?? view?.position ?? { x: isMainAgent ? 48 : 840 + index * 400, y: 48 },
      dragHandle: ".agent-drag-handle", style: isMainAgent && !view?.collapsed ? size : { width: 340 },
      data: { object, collapsed: view?.collapsed ?? false, historical: task.historical,
        renderAgent: isMainAgent ? renderAgent : undefined,
        onView: patch => { void run({ type: "view.set", task_id: task.id, object_id: object.id, ...patch }); } },
    }];
  }), [task, agentId, geometry, renderAgent, run, size]);
  const edges = useMemo<Edge[]>(() => {
    const visible = new Set(nodes.map(node => node.id));
    return task.bindings.filter(binding => visible.has(binding.resource_id) && visible.has(binding.agent_id)).map(binding => ({
      id: `binding:${binding.agent_id}:${binding.resource_id}`, source: binding.resource_id, target: binding.agent_id,
      label: binding.pending ? t.pending : t.readAccess, selectable: false, deletable: false,
      style: { stroke: "var(--primary)", ...(binding.pending ? { opacity: 0.5, strokeDasharray: "5 5" } : {}) },
    }));
  }, [task.bindings, nodes]);
  const onNodesChange = (changes: NodeChange<ObjectNodeType>[]) => setGeometry(applyNodeChanges(changes, nodes));
  return <div ref={host} className="island-panel overflow-hidden rounded-lg" aria-label={s("Workbench", "工作台")}>
    <ReactFlow<ObjectNodeType> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
      colorMode={scheme} style={{ background: "transparent" }} defaultViewport={task.viewport}
      fitView={initialFit} fitViewOptions={{ padding: 0.12, minZoom: 0.1, maxZoom: 1 }} minZoom={0.1} maxZoom={4}
      nodesDraggable={!task.historical} nodesConnectable={false} edgesReconnectable={false} nodesFocusable={false} deleteKeyCode={null}
      panOnScroll panOnDrag zoomOnDoubleClick={false} preventScrolling
      onNodeDragStop={(_event, node) => {
        void run({ type: "view.set", task_id: task.id, object_id: node.id, position: node.position }).then(ok => {
          if (!ok) setGeometry(current => current.filter(item => item.id !== node.id));
        });
      }}
      onMoveEnd={(event, viewport) => { if (event && !task.historical) void run({ type: "viewport.set", task_id: task.id, viewport }); }}>
      {canvas !== "none" && <Background color="var(--canvas-grid)" gap={24} size={canvas === "dots" ? 1.5 : canvas === "cross" ? 6 : undefined}
        variant={canvas === "dots" ? BackgroundVariant.Dots : canvas === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Cross} />}
      <Panel position="top-left" className="flex items-center gap-2">
        <span className="type-caption select-none rounded-md border bg-card/90 px-3 py-1.5">{s("Workbench", "工作台")}</span>
        <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="secondary" size="sm"><Shapes />{t.objects}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-auto">
            {task.objects.map(object => <DropdownMenuItem key={object.id} disabled={task.historical} onSelect={() => {
              const view = task.views.find(view => view.object_id === object.id);
              void run({ type: "view.set", task_id: task.id, object_id: object.id, hidden: !view?.hidden });
            }}><span className="min-w-0 flex-1 truncate">{object.title}</span><span className="type-caption">{task.views.find(view => view.object_id === object.id)?.hidden ? t.open : t.close}</span></DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <ResourceActions task={task} run={run} busy={busy} />
      </Panel>
      <CanvasControls task={task} agentId={agentId} run={run} />
    </ReactFlow>
  </div>;
}
function ResourceActions({ task, run, busy }: { task: TaskSnapshot; run: (command: Command) => Promise<boolean>; busy: boolean }) {
  const flow = useReactFlow();
  const [creation, setCreation] = useState<NoteCreation | null>(null);
  const [access, setAccess] = useState(false);
  return <>
    <Button variant="secondary" size="sm" disabled={busy || task.historical} onClick={() => {
      const nodes = flow.getNodes();
      const bounds = flow.getNodesBounds(nodes);
      setCreation({ taskId: task.id, position: nodes.length ? { x: bounds.x + bounds.width + 64, y: bounds.y } : { x: 48, y: 48 } });
    }}><FilePlus2 />{t.addNoteLabel}</Button>
    <Button variant="secondary" size="sm" disabled={busy || task.historical} onClick={() => setAccess(true)}><Link2 />{t.accessLabel}</Button>
    {creation && <CreateNoteDialog creation={creation} busy={busy} run={run} onClose={() => setCreation(null)} />}
    {access && <AccessDialog task={task} busy={busy} run={run} onClose={() => setAccess(false)} />}
  </>;
}
function CanvasControls({ task, agentId, run }: { task: TaskSnapshot; agentId: string; run: (command: Command) => Promise<boolean> }) {
  const flow = useReactFlow();
  const move = async (action: () => Promise<boolean>) => {
    await action();
    if (!task.historical) await run({ type: "viewport.set", task_id: task.id, viewport: flow.getViewport() });
  };
  const focusAgent = async () => {
    if (task.views.find(view => view.object_id === agentId)?.hidden) {
      await run({ type: "view.set", task_id: task.id, object_id: agentId, hidden: false });
      return;
    }
    await move(() => flow.fitView({ nodes: [{ id: agentId }], padding: 0.12, maxZoom: 1 }));
  };
  return <Panel position="bottom-right" className="surface flex items-center gap-0.5 bg-card p-1">
    <Button variant="ghost" size="icon-sm" aria-label={t.zoomOut} title={t.zoomOut} onClick={() => { void move(() => flow.zoomOut()); }}><Minus /></Button>
    <Button variant="ghost" size="sm" title={s("Actual size", "实际尺寸")} onClick={() => { void move(() => flow.zoomTo(1)); }}>100%</Button>
    <Button variant="ghost" size="icon-sm" aria-label={t.zoomIn} title={t.zoomIn} onClick={() => { void move(() => flow.zoomIn()); }}><Plus /></Button>
    <Button variant="ghost" size="icon-sm" aria-label={t.fitObjects} title={t.fitObjects} onClick={() => { void move(() => flow.fitView({ padding: 0.15, maxZoom: 1 })); }}><Maximize /></Button>
    <Button variant="ghost" size="sm" onClick={() => { void focusAgent(); }}><Scan />{s("Main agent", "主代理")}</Button>
  </Panel>;
}
