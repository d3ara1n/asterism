import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Command } from "../../shared/contracts";
import type { ApplicationController } from "./controller";
import { Button } from "../shared/ui/button";
import { Workbench } from "../features/workbench/Workbench";
import { AccessDialog } from "../features/workbench/AccessDialog";
import { CreateDialog, type Creation } from "./CreateDialog";
import { Dialog } from "../shared/ui/dialog";
import { placeObject } from "../features/workbench/placement";
import { WindowShell } from "./WindowShell";

export function App({ controller }: { controller: ApplicationController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const workbenchRef = useRef<HTMLElement>(null);
  const [panel, setPanel] = useState<"tasks" | "objects" | "history" | null>(null);
  const [creation, setCreation] = useState<Creation | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const run = useCallback((command: Command) => controller.run(command), [controller]);
  useEffect(() => controller.connect(), [controller]);
  const snapshot = state.snapshot;
  const task = snapshot?.task;
  const writable = state.status === "ready" && !state.busy && !task?.historical;
  const add = (kind: "agent" | "note") => {
    const bounds = workbenchRef.current?.getBoundingClientRect();
    if (!task || !bounds) return;
    setCreation({ kind, taskId: task.id, position: placeObject(task, bounds.width, bounds.height) });
  };

  const navigation = <>
    <Button variant="ghost" size="sm" onClick={() => setPanel(panel === "tasks" ? null : "tasks")} aria-expanded={panel === "tasks"} aria-label="Tasks · 任务">
      <span className="text-sm font-semibold text-primary">weft</span>
      <span className="text-muted-foreground" aria-hidden="true">⌄</span>
    </Button>
    <span className="h-4 w-px shrink-0 bg-border" />
    <span className="window-task-title" title={task?.title}>{task?.title ?? "Workspace · 工作区"}</span>
    {task && <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "history" ? null : "history")} aria-expanded={panel === "history"} aria-label="History · 历史">
      History<span className="toolbar-translation">· 历史</span>
    </Button>}
  </>;
  const actions = task ? <>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={() => add("agent")} aria-label="Add agent · 添加代理">+ Agent<span className="toolbar-translation">· 代理</span></Button>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={() => add("note")} aria-label="Add note · 添加笔记">+ Note<span className="toolbar-translation">· 笔记</span></Button>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={() => setAccessOpen(true)} aria-label="Resource access · 资源授权">Access<span className="toolbar-translation">· 授权</span></Button>
    <Button variant="ghost" size="sm" onClick={() => setPanel(panel === "objects" ? null : "objects")} aria-expanded={panel === "objects"} aria-label="Objects · 对象">Objects<span className="toolbar-translation">· 对象</span></Button>
  </> : <Button variant="ghost" size="sm" disabled={!writable} onClick={() => setCreation({ kind: "task" })}>+ Task<span className="toolbar-translation">· 新建任务</span></Button>;

  return <WindowShell navigation={navigation} actions={actions} workbenchRef={workbenchRef}>
    {task ? <Workbench key={task.id + ":" + (task.historical ? task.at_seq : "live")} task={task} run={run} /> : <div className="empty-workbench">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 text-5xl font-light text-primary" aria-hidden="true">⌘</div>
        <h1 className="text-2xl font-semibold tracking-tight">{snapshot ? "A place for your next task" : state.status === "unavailable" ? "Workspace unavailable" : "Opening your workspace"}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{snapshot ? "Start a task, then bring agents and resources onto your workbench." : state.status === "unavailable" ? "Restart Weft to reopen your saved work." : "Reading your saved work."}</p>
        <p className="mt-2 text-xs text-muted-foreground">{snapshot ? "创建任务，在工作台组织代理与资源。" : "织台"}</p>
        {snapshot && <Button className="mt-7" disabled={!writable} onClick={() => setCreation({ kind: "task" })}>New task · 新建任务</Button>}
      </div>
    </div>}
    {task && task.objects.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">{task.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{task.historical ? "No objects existed here yet. · 此时尚无对象。" : "Add an agent or a note to begin. · 添加代理或笔记开始工作。"}</p>
      </div>
    </div>}

    {panel && <aside aria-label={panel} className="floating-panel absolute bottom-12 left-2 top-2 z-20 flex w-72 flex-col">
      <header className="flex items-center justify-between p-2">
        <h2 className="text-sm font-semibold">{panel === "tasks" ? "Tasks · 任务" : panel === "objects" ? "Objects · 对象" : "History · 历史"}</h2>
        <Button variant="ghost" size="icon" onClick={() => setPanel(null)} aria-label="Close panel · 关闭面板">×</Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {panel === "tasks" && <>
          <p className="mb-4 px-2 text-xs text-muted-foreground">{snapshot?.workspace.title}</p>
          {snapshot?.tasks.map(item => <button key={item.id} className={`list-item ${task?.id === item.id ? "bg-secondary" : ""}`} disabled={state.busy} onClick={() => { void run({ type: "workspace.read", task_id: item.id }); setPanel(null); }}>
            <span className="truncate">{item.title}</span>
          </button>)}
          <Button className="mt-4 w-full" disabled={state.status !== "ready" || state.busy} onClick={() => setCreation({ kind: "task" })}>New task · 新建任务</Button>
        </>}
        {panel === "objects" && task?.objects.map(object => {
          const view = task.views.find(v => v.object_id === object.id);
          return <div className="list-item" key={object.id}>
            <div className="min-w-0 flex-1"><p className="truncate">{object.title}</p><p className="mt-1 text-xs text-muted-foreground">{object.kind}</p></div>
            <Button variant="ghost" size="sm" disabled={!writable} onClick={() => { void run({ type: "view.set", task_id: task.id, object_id: object.id, hidden: !view?.hidden }); }}>{view?.hidden ? "Open · 打开" : "Close · 关闭"}</Button>
          </div>;
        })}
        {panel === "history" && task && <>
          <Button className="mb-4 w-full" variant={task.historical ? "secondary" : "default"} disabled={state.busy} onClick={() => { void run({ type: "workspace.read", task_id: task.id }); }}>Live · 当前</Button>
          {task.history.map(entry => <button className={`list-item flex-col items-start ${task.historical && task.at_seq === entry.seq ? "bg-secondary" : ""}`} key={entry.event_id} disabled={state.busy} onClick={() => { void run({ type: "workspace.read", task_id: task.id, at_seq: entry.seq }); }}>
            <span>{entry.label}</span><time className="text-xs text-muted-foreground">{new Date(entry.recorded_at).toLocaleString()}</time>
          </button>)}
        </>}
      </div>
    </aside>}

    {task?.historical && <div className="floating-bar absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4 whitespace-nowrap text-sm">
      <span>Viewing history · 正在查看历史</span>
      <Button size="sm" disabled={state.busy} onClick={() => { void run({ type: "workspace.read", task_id: task.id }); }}>Back to live · 返回当前</Button>
    </div>}
    <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 text-xs text-muted-foreground">
      <span role="status" className="rounded-control bg-background/90 px-2 py-1">{state.busy ? "Saving / loading · 正在处理" : state.status === "ready" ? "Local workspace · 本地工作区" : "Connection unavailable · 连接不可用"}</span>
      <button className="hover:text-foreground" onClick={() => setAboutOpen(true)}>About · 关于</button>
    </div>
    {state.error && <div role="alert" className="absolute bottom-16 left-1/2 z-[60] flex w-[min(600px,calc(100%-32px))] -translate-x-1/2 items-start gap-3 rounded-surface bg-destructive p-4 text-sm text-white shadow-dialog">
      <p className="flex-1">{state.error}</p><button aria-label="Dismiss error · 关闭错误" onClick={controller.clearError}>×</button>
    </div>}
    {creation && <CreateDialog creation={creation} busy={state.busy} run={run} onClose={() => setCreation(null)} />}
    {accessOpen && task && <AccessDialog task={task} busy={state.busy} run={run} onClose={() => setAccessOpen(false)} />}
    {aboutOpen && <Dialog title="Weft · 织台" description="Your local, object-centered workbench. · 以对象为中心的本地工作台。" onClose={() => setAboutOpen(false)}>
      <p className="text-sm leading-relaxed text-muted-foreground">Tasks, notes, bindings and canvas positions are saved locally. Model execution and external file tools are not connected yet.</p>
      <p className="mt-3 text-sm text-muted-foreground">任务、笔记、绑定和画布位置已在本地保存。模型执行与外部文件工具尚未接入。</p>
    </Dialog>}
  </WindowShell>;
}
