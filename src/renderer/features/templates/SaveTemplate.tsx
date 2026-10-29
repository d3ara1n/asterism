import { useEffect, useId, useRef, useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import type { TemplateObjectSummary } from "../../../shared/templates";
import { templateMessages } from "../../../shared/template-messages";
import { errorDisplay } from "../../../shared/error-display";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { formsMessages } from "@asterism-app/ui/messages/forms";
import { Button } from "@asterism-app/ui/ui/button";
import { Checkbox } from "@asterism-app/ui/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { Field, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { TemplateObjectLabel } from "./TemplateObjects";

export function SaveTemplate({ sessionId, title, disabled, onSaved, onClose, onRestoreFocus }: {
  sessionId: string; title: string; disabled: boolean;
  onSaved: () => void; onClose: () => void; onRestoreFocus: () => void;
}) {
  const i18n = useI18n();
  const id = useId();
  const pending = useRef(false);
  const [name, setName] = useState(title);
  const [objects, setObjects] = useState<TemplateObjectSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(null);
    void runtime.session.execute({ type: "template.source", sessionId }).then(result => {
      if (!active) return;
      if (!result.ok) { setError(errorDisplay(result.error)); return; }
      if (result.reply.kind !== "template.source") throw new Error("Invalid template source receipt.");
      setObjects(result.reply.objects);
      setSelected(new Set(result.reply.objects.map(object => object.id)));
    }).catch(() => { if (active) setError(commonMessages.connectionLost); });
    return () => { active = false; };
  }, [sessionId, retry]);
  const close = () => { if (!pending.current) onClose(); };
  const save = async () => {
    if (pending.current || disabled || !name.trim() || !selected.size) return;
    pending.current = true; setSaving(true); setError(null);
    try {
      const result = await runtime.session.execute({ type: "template.save", sessionId, title: name, objectIds: [...selected] });
      if (!result.ok) { setError(errorDisplay(result.error)); return; }
      onSaved(); onClose();
    } catch { setError(commonMessages.connectionLost); }
    finally { pending.current = false; setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent showCloseButton={!saving} onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
      <DialogHeader>
        <DialogTitle>{i18n.text(templateMessages.saveAs)}</DialogTitle>
        <DialogDescription>{i18n.text(templateMessages.description)}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <Field>
          <FieldLabel htmlFor={id}>{i18n.text(templateMessages.name)}</FieldLabel>
          <Input id={id} value={name} required maxLength={160} disabled={saving}
            onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
            }} />
        </Field>
        <fieldset className="min-w-0" disabled={saving}>
          <legend className="type-label mb-2">{i18n.text(templateMessages.objects)}</legend>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {objects?.map(object => <Field key={object.id} orientation="horizontal">
              <Checkbox id={`${id}-${object.id}`} checked={selected.has(object.id)} onCheckedChange={checked => {
                setSelected(current => {
                  const next = new Set(current);
                  if (checked) next.add(object.id); else next.delete(object.id);
                  return next;
                });
              }} />
              <FieldLabel htmlFor={`${id}-${object.id}`} className="min-w-0 font-normal"><TemplateObjectLabel object={object} /></FieldLabel>
            </Field>)}
            {objects?.length === 0 && <p className="type-caption">{i18n.text(templateMessages.noObjects)}</p>}
            {!objects && !error && <p role="status" className="type-caption flex items-center gap-2"><Spinner />{i18n.text(templateMessages.loading)}</p>}
          </div>
        </fieldset>
        {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription>
          {!objects && <Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>{i18n.text(commonMessages.retry)}</Button>}
        </Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={close}>{i18n.text(commonMessages.cancel)}</Button>
          <Button type="submit" disabled={saving || disabled || !name.trim() || !selected.size}>
            {saving && <Spinner />}{i18n.text(saving ? formsMessages.saving : formsMessages.save)}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
