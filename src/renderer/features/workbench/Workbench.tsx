import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, BackgroundVariant, Panel, useReactFlow, applyNodeChanges, type NodeChange, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Command, TaskSnapshot } from "../../../shared/contracts";
import { Maximize, Minus, Plus } from "lucide-react";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { useAppearance, useScheme } from "../appearance/state";
import { ObjectNode, type ObjectNodeType } from "./ObjectNode";

const nodeTypes = { object: ObjectNode };

export function Workbench({ task, run }: { task: TaskSnapshot; run: (command: Command) => Promise<boolean> }) {
  const { canvas } = useAppearance();
  const scheme = useScheme();
  const toNodes = useCallback((): ObjectNodeType[] => task.objects.flatMap(object => {
    const view = task.views.find(v => v.object_id === object.id);
    if (!view || view.hidden) return [];
    return [{
      id: object.id, type: "object" as const, position: view.position, dragHandle: ".card-drag-handle",
      data: {
        object, collapsed: view.collapsed, historical: task.historical,
        bindingCount: task.bindings.filter(b => b.agent_id === object.id && b.pending !== "attach").length,
        onView: (patch: { hidden?: boolean; collapsed?: boolean }) => { void run({ type: "view.set", task_id: task.id, object_id: object.id, ...patch }); },
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
  const edges: Edge[] = useMemo(() => task.bindings.map(binding => ({
    id: `${binding.agent_id}:${binding.resource_id}`, source: binding.resource_id, target: binding.agent_id,
    label: binding.pending ? t.pending : t.readAccess,
    style: { stroke: "var(--primary)", ...(binding.pending ? { opacity: 0.5, strokeDasharray: "5 5" } : {}) },
    selectable: false, deletable: false,
  })), [task.bindings]);
  const onNodesChange = useCallback((changes: NodeChange<ObjectNodeType>[]) => {
    setNodes(current => applyNodeChanges(changes, current));
    for (const change of changes) {
      if (change.type === "position" && change.position && change.dragging === false && !task.historical) {
        void run({ type: "view.set", task_id: task.id, object_id: change.id, position: change.position }).then(saved => { if (!saved) setNodes(toNodes()); });
      }
    }
  }, [run, task.id, task.historical, toNodes]);
  return <ReactFlow<ObjectNodeType>
    colorMode={scheme} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
    defaultViewport={task.viewport} minZoom={0.1} maxZoom={4}
    nodesDraggable={!task.historical} nodesConnectable={false} edgesReconnectable={false}
    deleteKeyCode={null} panOnScroll selectionOnDrag panOnDrag={[1, 2]} zoomOnDoubleClick={false}
    onMoveEnd={(event, viewport) => { if (event && !task.historical) void run({ type: "viewport.set", task_id: task.id, viewport }); }}
  >
    {canvas !== "none" && <Background color="var(--canvas-grid)" gap={24} size={canvas === "dots" ? 1.5 : canvas === "cross" ? 6 : undefined}
      variant={canvas === "dots" ? BackgroundVariant.Dots : canvas === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Cross} />}
    <ViewControls task={task} run={run} />
  </ReactFlow>;
}

function ViewControls({ task, run }: { task: TaskSnapshot; run: (command: Command) => Promise<boolean> }) {
  const flow = useReactFlow();
  const move = async (action: () => Promise<boolean>) => {
    await action();
    // 工具栏是明确的用户操作；程序化缩放不产生 DOM event，需显式保存。
    if (!task.historical) await run({ type: "viewport.set", task_id: task.id, viewport: flow.getViewport() });
  };
  return <Panel position="bottom-right" className="surface flex flex-col p-0.5">
    {([[t.zoomIn, Plus, () => flow.zoomIn()], [t.zoomOut, Minus, () => flow.zoomOut()], [t.fitObjects, Maximize, () => flow.fitView({ padding: 0.25 })]] as const).map(([label, Icon, action]) =>
      <Button key={label} variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={() => { void move(action); }}><Icon /></Button>)}
  </Panel>;
}
