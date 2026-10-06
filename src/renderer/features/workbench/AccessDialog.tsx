import { useState } from "react";
import type { Command, TaskSnapshot } from "../../../shared/contracts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/ui/dialog";
import { Button } from "../../shared/ui/button";
import { Field, FieldLabel } from "../../shared/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { t } from "../../shared/i18n";

export function AccessDialog({ task, busy, run, onClose }: {
  task: TaskSnapshot; busy: boolean; run: (command: Command) => Promise<boolean>; onClose: () => void;
}) {
  const agents = task.objects.filter(o => o.kind === "agent");
  const resources = task.objects.filter(o => o.kind !== "agent");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{t.accessLabel}</DialogTitle><DialogDescription>{t.accessDescription}</DialogDescription></DialogHeader>
    {!agents.length || !resources.length ? <p className="type-body text-muted-foreground">{t.accessEmpty}</p> : <>
      <Field className="mb-5"><FieldLabel htmlFor="access-agent">{t.agent}</FieldLabel>
        <Select value={agentId} onValueChange={setAgentId}><SelectTrigger id="access-agent"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{agents.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.title}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <div className="space-y-2">{resources.map(resource => {
        const binding = task.bindings.find(b => b.agent_id === agentId && b.resource_id === resource.id);
        return <div key={resource.id} className="flex items-center gap-3 rounded-md border p-2 pl-3">
          <span className="min-w-0 flex-1 truncate text-sm">{resource.title}</span>
          <Button size="sm" variant={binding ? "secondary" : "default"} disabled={busy || task.historical || !!binding?.pending} onClick={() => { void run({ type: "binding.set", task_id: task.id, agent_id: agentId, resource_id: resource.id, attached: !binding }); }}>
            {binding?.pending ? t.pending : binding ? t.unbind : t.bind}
          </Button>
        </div>;
      })}</div>
    </>}
  </DialogContent></Dialog>;
}
