import { useState } from "react";
import type { WorkbenchCommand, WorkbenchSnapshot } from "../../../shared/workbench";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/ui/dialog";
import { Button } from "../../shared/ui/button";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Field, FieldLabel } from "../../shared/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "../../shared/ui/item";
import { t } from "../../shared/i18n";

export function AccessDialog({ session, ready, busy, historical, error, run, onClose }: {
  session: WorkbenchSnapshot; ready: boolean; busy: boolean; historical: boolean; error?: string | null;
  run: (command: WorkbenchCommand) => Promise<boolean>; onClose: () => void;
}) {
  const agents = session.objects.filter(o => o.kind === "agent");
  const resources = session.objects.filter(o => o.kind !== "agent");
  const [selected, setSelected] = useState(agents[0]?.id ?? "");
  // 代理列表变化后，失效的选择回落到第一个代理。
  const agentId = agents.some(agent => agent.id === selected) ? selected : agents[0]?.id ?? "";
  const writable = ready && !busy && !historical;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t.accessLabel}</DialogTitle>
        <DialogDescription>{t.accessDescription}</DialogDescription>
      </DialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {historical && <Alert><AlertDescription>{t.historyReadOnly}</AlertDescription></Alert>}
      {!agents.length || !resources.length ? <p className="type-body text-muted-foreground">{t.accessEmpty}</p> : <>
        <Field className="mb-5">
          <FieldLabel htmlFor="access-agent">{t.agent}</FieldLabel>
          <Select value={agentId} onValueChange={setSelected}>
            <SelectTrigger id="access-agent"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              {agents.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.title}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <ItemGroup className="gap-2">
          {resources.map(resource => {
            const linked = session.links.some(b => b.agentId === agentId && b.resourceId === resource.id);
            return <Item key={resource.id} variant="outline" size="sm" className="py-2 pr-2 pl-3">
              <ItemContent className="min-w-0"><ItemTitle className="truncate">{resource.title}</ItemTitle></ItemContent>
              <ItemActions><Button size="sm" variant={linked ? "secondary" : "default"} disabled={!writable}
                aria-label={linked ? t.unbindResource(resource.title) : t.bindResource(resource.title)}
                onClick={() => { void run({ type: "link.set", sessionId: session.id, agentId, resourceId: resource.id, linked: !linked }); }}>
                {linked ? t.unbind : t.bind}
              </Button></ItemActions>
            </Item>;
          })}
        </ItemGroup>
      </>}
    </DialogContent>
  </Dialog>;
}
