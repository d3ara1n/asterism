import { useEffect, useId, useRef, useState } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import type { TemplateObjectSummary, TemplateSummary } from "../../../shared/templates";
import { templateMessages } from "../../../shared/template-messages";
import { errorDisplay } from "../../../shared/error-display";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { formsMessages } from "@asterism-app/ui/messages/forms";
import { Button } from "@asterism-app/ui/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { Checkbox } from "@asterism-app/ui/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { folderMessages } from "../../../shared/folder-messages";
import { existingFolder, useFolders } from "../folders/context";
import { sortFolders } from "../folders/grouping";
import { FolderDot } from "../folders/marks";
import { TemplateObjectLabel } from "./TemplateObjects";

// Radix Select items need non-empty values; folder identities are UUIDs, so this cannot collide.
const noFolder = "none";

/** The template folder defaults to the source session's folder; sessions started from the template land there. */
export function SaveTemplate({ sessionId, title, folderId, templates, disabled, onSaved, onClose, onRestoreFocus }: {
  sessionId: string; title: string; folderId: string | null; templates: readonly TemplateSummary[]; disabled: boolean;
  onSaved: () => void; onClose: () => void; onRestoreFocus: () => void;
}) {
  const i18n = useI18n();
  const id = useId();
  const pending = useRef(false);
  const { folders } = useFolders();
  const [mode, setMode] = useState<"create" | "replace">("create");
  const [targetId, setTargetId] = useState("");
  const target = templates.find(template => template.id === targetId);
  const targetHasDuplicateTitle = target && templates.some(template => template.id !== target.id && template.title === target.title);
  const [name, setName] = useState(title);
  const [folder, setFolder] = useState<string | null>(folderId);
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
  const cannotSave = disabled || !selected.size || (mode === "create" ? !name.trim() : !target);
  const save = async () => {
    if (pending.current || cannotSave) return;
    pending.current = true; setSaving(true); setError(null);
    try {
      const result = await runtime.session.execute(mode === "replace"
        ? { type: "template.replace", sessionId, templateId: targetId, objectIds: [...selected] }
        : { type: "template.save", sessionId, title: name, objectIds: [...selected],
          folderId: existingFolder(folders, folder)?.id ?? null });
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
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <FieldGroup className="gap-4">
          <ToggleGroup type="single" variant="outline" value={mode} disabled={saving}
            aria-label={i18n.text(templateMessages.saveMode)} onValueChange={value => {
              if (value === "create" || value === "replace") setMode(value);
            }}>
            <ToggleGroupItem value="create">{i18n.text(templateMessages.create)}</ToggleGroupItem>
            <ToggleGroupItem value="replace" disabled={!templates.length}>{i18n.text(templateMessages.replace)}</ToggleGroupItem>
          </ToggleGroup>
          {mode === "replace" ? <Field>
            <FieldLabel htmlFor={`${id}-target`}>{i18n.text(templateMessages.replaceTarget)}</FieldLabel>
            <Select value={target?.id ?? ""} onValueChange={setTargetId} disabled={saving}>
              <SelectTrigger id={`${id}-target`} className="w-full">
                <SelectValue placeholder={i18n.text(templateMessages.selectTarget)}>
                  {target && <span className="truncate">{target.title}{targetHasDuplicateTitle && <> · {target.id.slice(0, 8)}</>}</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" className="w-(--radix-select-trigger-width)"><SelectGroup>
                {templates.map(template => {
                  const targetFolder = existingFolder(folders, template.folderId);
                  const duplicateTitle = templates.some(other => other.id !== template.id && other.title === template.title);
                  return <SelectItem key={template.id} value={template.id} textValue={template.title} className="[&>span:last-child]:min-w-0">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate">{template.title}</span>
                      <span className="type-caption">
                        {targetFolder?.name ?? i18n.text(folderMessages.noFolder)}
                        {" · "}{i18n.formatMessage(templateMessages.created, { time: Date.parse(template.createdAt) })}
                        {duplicateTitle && <> · {template.id.slice(0, 8)}</>}
                      </span>
                    </span>
                  </SelectItem>;
                })}
              </SelectGroup></SelectContent>
            </Select>
          </Field> : <>
            <Field>
              <FieldLabel htmlFor={id}>{i18n.text(templateMessages.name)}</FieldLabel>
              <Input id={id} value={name} required maxLength={160} disabled={saving}
                onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
                }} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-folder`}>{i18n.text(folderMessages.folder)}</FieldLabel>
              <Select value={existingFolder(folders, folder)?.id ?? noFolder} disabled={saving}
                onValueChange={value => setFolder(value === noFolder ? null : value)}>
                <SelectTrigger id={`${id}-folder`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value={noFolder}>{i18n.text(folderMessages.noFolder)}</SelectItem>
                  {sortFolders(folders, i18n.locale).map(item => <SelectItem key={item.id} value={item.id}>
                    <FolderDot color={item.color} />{item.name}
                  </SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
          </>}
          <FieldSet className="min-w-0 gap-2" disabled={saving}>
            <FieldLegend variant="label">{i18n.text(templateMessages.objects)}</FieldLegend>
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
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
          </FieldSet>
          {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription>
            {!objects && <Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>{i18n.text(commonMessages.retry)}</Button>}
          </Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={close}>{i18n.text(commonMessages.cancel)}</Button>
            <Button type="submit" disabled={saving || cannotSave}>
              {saving && <Spinner />}{i18n.text(mode === "replace"
                ? saving ? templateMessages.replacing : templateMessages.replace
                : saving ? formsMessages.saving : formsMessages.save)}
            </Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </DialogContent>
  </Dialog>;
}
