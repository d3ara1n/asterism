import { useState } from "react";
import type { Command, TaskSnapshot } from "../../../shared/contracts";
import { Dialog } from "../../shared/ui/dialog";
import { Button } from "../../shared/ui/button";

export function AccessDialog({ task, busy, run, onClose }: {
  task: TaskSnapshot; busy: boolean; run: (command: Command) => Promise<boolean>; onClose: () => void;
}) {
  const agents = task.objects.filter(o => o.kind === "agent");
  const resources = task.objects.filter(o => o.kind !== "agent");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  return <Dialog title="Resource access · 资源授权" description="A binding grants this agent read access to a note. Closing a card does not revoke access. · 绑定授予读取权限，关闭卡片不等于解绑。" onClose={onClose}>
    {!agents.length || !resources.length ? <p className="text-sm text-muted-foreground">Add an agent and a note to manage access. · 先添加代理和笔记。</p> : <>
      <label className="text-sm">Agent · 代理<select className="field mt-2 mb-5" value={agentId} onChange={e => setAgentId(e.target.value)}>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.title}</option>)}</select></label>
      <div className="space-y-2">{resources.map(resource => {
        const binding = task.bindings.find(b => b.agent_id === agentId && b.resource_id === resource.id);
        return <div key={resource.id} className="flex items-center gap-3 rounded-lg bg-secondary/40 p-3">
          <span className="min-w-0 flex-1 truncate text-sm">{resource.title}</span>
          <Button size="sm" variant={binding ? "secondary" : "default"} disabled={busy || task.historical || !!binding?.pending} onClick={() => { void run({ type: "binding.set", task_id: task.id, agent_id: agentId, resource_id: resource.id, attached: !binding }); }}>
            {binding?.pending ? "Pending · 待生效" : binding ? "Unbind · 解绑" : "Bind · 绑定"}
          </Button>
        </div>;
      })}</div>
    </>}
  </Dialog>;
}
