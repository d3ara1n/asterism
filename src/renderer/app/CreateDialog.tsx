import { useState } from "react";
import type { Command, Point } from "../../shared/contracts";
import { Dialog } from "../shared/ui/dialog";
import { Button } from "../shared/ui/button";

export type Creation = { kind: "task" } | { kind: "agent" | "note"; taskId: string; position: Point };
export function CreateDialog({ creation, busy, run, onClose }: {
  creation: Creation; busy: boolean; run: (command: Command) => Promise<boolean>; onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const label = creation.kind === "task" ? "New task · 新建任务" : creation.kind === "agent" ? "Add agent · 添加代理" : "Add note · 添加笔记";
  return <Dialog title={label} description={creation.kind === "note" ? "Save a note as a task resource. Access is granted separately. · 保存为任务资源，授权需另行绑定。" : "Give this work a name. · 为这件工作命名。"} onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      const command: Command = creation.kind === "task" ? { type: "task.create", title } :
        creation.kind === "agent" ? { type: "agent.create", task_id: creation.taskId, title, position: creation.position } :
        { type: "note.create", task_id: creation.taskId, title, content, position: creation.position };
      void run(command).then(saved => { if (saved) onClose(); });
    }} className="space-y-5">
      <label className="block text-sm">Name · 名称<input autoFocus required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} className="field mt-2" /></label>
      {creation.kind === "note" && <label className="block text-sm">Content · 内容<textarea required maxLength={100_000} value={content} onChange={e => setContent(e.target.value)} rows={7} className="field mt-2 resize-y" /></label>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel · 取消</Button><Button disabled={busy || !title.trim() || (creation.kind === "note" && !content.trim())}>Create · 创建</Button></div>
    </form>
  </Dialog>;
}
