import { useId, useState } from "react";
import { Button } from "@asterism-app/ui/ui/button";
import { Input } from "@asterism-app/ui/ui/input";
import { Checkbox } from "@asterism-app/ui/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend } from "@asterism-app/ui/ui/field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@asterism-app/ui/ui/dialog";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Badge } from "@asterism-app/ui/ui/badge";
import { ScrollArea } from "@asterism-app/ui/ui/scroll-area";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import type { PluginManager } from "./PluginsSettings";
import { pluginsMessages as messages } from "../../messages/plugins";
import { useI18n } from "../../shared/i18n";

const phaseLabels = {
  inspecting: messages.inspecting, preview: messages.previewReady, installing: messages.installing,
  "awaiting-approval": messages.buildApproval, cancelling: messages.cancelling, succeeded: messages.installSucceeded,
  failed: messages.installFailed, cancelled: messages.installCancelled,
};

/** Registry inspection and installation stay in the host settings surface; opening the dialog activates no code. */
export function NpmPluginInstaller({ manager, target, onClose }: {
  manager: PluginManager; target: { targetSource?: string; name?: string }; onClose(): void;
}) {
  const i18n = useI18n();
  const id = useId();
  const operation = manager.operation;
  const matching = operation?.targetSource === (target.targetSource ?? null);
  const [spec, setSpec] = useState(target.name ? `${target.name}@latest` : matching ? operation?.spec ?? "" : "");
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const pending = operation && ["inspecting", "installing", "awaiting-approval", "cancelling"].includes(operation.phase);
  const current = matching ? operation : null;
  const preview = current?.preview;
  const changed = spec.trim() !== current?.spec;
  const active = operation && ["inspecting", "installing", "cancelling"].includes(operation.phase);
  const inspect = () => {
    setApproved(new Set());
    void manager.run({ type: "plugin.npm.preview", spec, ...(target.targetSource ? { targetSource: target.targetSource } : {}) });
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{i18n.text(target.targetSource ? messages.updateNpm : messages.installNpm)}</DialogTitle>
        <DialogDescription>{i18n.text(messages.npmTrust)}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id}>{i18n.text(messages.packageSpec)}</FieldLabel>
          <Input id={id} value={spec} disabled={Boolean(pending) || manager.busy} placeholder="@publisher/plugin@latest"
            onChange={event => setSpec(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !pending && spec.trim()) inspect(); }} />
          <FieldDescription>{i18n.text(messages.packageSpecHint)}</FieldDescription>
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={!spec.trim() || Boolean(pending) || manager.busy} onClick={inspect}>{i18n.text(messages.inspectPackage)}</Button>
          {operation && <Badge role="status" variant={operation.phase === "failed" ? "destructive" : "secondary"}>{active && <Spinner />}{i18n.text(phaseLabels[operation.phase])}</Badge>}
        </div>
        {preview && <Field>
          <FieldLabel>{preview.name}@{preview.version}</FieldLabel>
          {preview.description && <FieldDescription>{preview.description}</FieldDescription>}
          {current.phase === "preview" && <Button size="sm" disabled={manager.busy || changed} onClick={() => { void manager.run({ type: "plugin.npm.install", operationId: current.id }); }}>
            {i18n.text(target.targetSource ? messages.confirmUpdate : messages.confirmInstall)}
          </Button>}
        </Field>}
        {operation?.phase === "awaiting-approval" && <FieldSet>
          <FieldLegend>{i18n.text(messages.buildApproval)}</FieldLegend>
          <FieldDescription>{i18n.text(messages.buildTrust)}</FieldDescription>
          {operation.blockedBuilds.map(name => <Field key={name} orientation="horizontal">
            <Checkbox id={`${id}-${name}`} checked={approved.has(name)} disabled={manager.busy} onCheckedChange={checked => setApproved(previous => {
              const next = new Set(previous); if (checked === true) next.add(name); else next.delete(name); return next;
            })} />
            <FieldLabel htmlFor={`${id}-${name}`}>{name}</FieldLabel>
          </Field>)}
          <Button size="sm" disabled={manager.busy || !operation.blockedBuilds.some(name => approved.has(name))} onClick={() => {
            void manager.run({ type: "plugin.npm.approve", operationId: operation.id, packages: operation.blockedBuilds.filter(name => approved.has(name)) });
          }}>{i18n.text(messages.approveBuilds)}</Button>
        </FieldSet>}
        {operation?.error && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap wrap-anywhere">{operation.error}</AlertDescription></Alert>}
        {manager.error && <Alert variant="destructive"><AlertDescription>{i18n.text(manager.error)}</AlertDescription></Alert>}
        {operation?.phase === "succeeded" && <Alert><AlertDescription>{i18n.text(messages.restartHint)}</AlertDescription></Alert>}
        {operation?.output && <ScrollArea className="h-48 rounded-md border"><pre className="type-caption select-text whitespace-pre-wrap wrap-anywhere p-3">{operation.output}</pre></ScrollArea>}
        {pending && <Button variant="outline" size="sm" disabled={manager.busy || operation.phase === "cancelling"} onClick={() => { void manager.run({ type: "plugin.npm.cancel", operationId: operation.id }); }}>{i18n.text(messages.cancelInstallation)}</Button>}
      </FieldGroup>
    </DialogContent>
  </Dialog>;
}
