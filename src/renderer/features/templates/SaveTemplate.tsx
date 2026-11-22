import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, FilePlus2, Replace } from "lucide-react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { StatusText } from "@asterism-app/ui/ui/status";
import { folderMessages } from "../../../shared/folder-messages";
import { existingFolder, useFolders } from "../folders/context";
import { sortFolders } from "../folders/grouping";
import { FolderDot } from "../folders/marks";
import { TemplateKindIcons, TemplateObjectLabel } from "./TemplateObjects";
import { TemplateTargetPicker } from "./TemplateTargetPicker";

// Radix Select items need non-empty values; folder identities are UUIDs, so this cannot collide.
const noFolder = "none";

/**
 * The template folder defaults to the source session's folder; sessions started from the template land there.
 * Replacement keeps the target's name and folder, so those fields give way to the target picker and a contents comparison.
 */
export function SaveTemplate({ sessionId, title, folderId, templates, disabled, onSaved, onClose, onRestoreFocus }: {
  sessionId: string; title: string; folderId: string | null; templates: readonly TemplateSummary[]; disabled: boolean;
  onSaved: () => void; onClose: () => void; onRestoreFocus: () => void;
}) {
  const i18n = useI18n();
  const id = useId();
  const pending = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const { folders } = useFolders();
  const [mode, setMode] = useState<"create" | "replace">("create");
  const [targetId, setTargetId] = useState("");
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
  // The catalog can empty while the dialog is open; replacement then has nothing to target.
  const replacing = mode === "replace" && templates.length > 0;
  const target = templates.find(template => template.id === targetId);
  // The catalog lists newest first, so a name shared by several templates offers the most recent one.
  const sameName = replacing ? undefined : templates.find(template => template.title === name.trim());
  const close = () => { if (!pending.current) onClose(); };
  const cannotSave = disabled || !selected.size || (replacing ? !target : !name.trim());
  const save = async () => {
    if (pending.current || cannotSave) return;
    pending.current = true; setSaving(true); setError(null);
    try {
      const result = await runtime.session.execute(replacing
        ? { type: "template.replace", sessionId, templateId: targetId, objectIds: [...selected] }
        : { type: "template.save", sessionId, title: name, objectIds: [...selected],
          folderId: existingFolder(folders, folder)?.id ?? null });
      if (!result.ok) { setError(errorDisplay(result.error)); return; }
      onSaved(); onClose();
    } catch { setError(commonMessages.connectionLost); }
    finally { pending.current = false; setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent showCloseButton={!saving}
      onOpenAutoFocus={event => { event.preventDefault(); nameInput.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
      <DialogHeader>
        <DialogTitle>{i18n.text(templateMessages.saveAs)}</DialogTitle>
        <DialogDescription>{i18n.text(templateMessages.description)}</DialogDescription>
      </DialogHeader>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <FieldGroup className="gap-4">
          {templates.length > 0 && <ToggleGroup type="single" variant="segmented" className="w-full" value={replacing ? "replace" : "create"}
            disabled={saving} aria-label={i18n.text(templateMessages.saveMode)} onValueChange={value => {
              if (value === "create" || value === "replace") setMode(value);
            }}>
            <ToggleGroupItem value="create" className="flex-1"><FilePlus2 />{i18n.text(templateMessages.create)}</ToggleGroupItem>
            <ToggleGroupItem value="replace" className="flex-1"><Replace />{i18n.text(templateMessages.replace)}</ToggleGroupItem>
          </ToggleGroup>}
          {replacing ? <Field>
            <FieldLabel htmlFor={`${id}-target`}>{i18n.text(templateMessages.replaceTarget)}</FieldLabel>
            <TemplateTargetPicker id={`${id}-target`} templates={templates} value={target} disabled={saving} onValueChange={setTargetId} />
            {/* Replacement is a complete snapshot: the comparison shows what the target holds now and what it will hold. */}
            {target && objects && <FieldDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="flex items-center gap-1.5"><TemplateKindIcons objects={target.objects} />
                {i18n.formatMessage(templateMessages.objectCount, { count: target.objects.length })}</span>
              <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="sr-only">{i18n.text(templateMessages.replacedWith)}</span>
              <span className="flex items-center gap-1.5 text-foreground">
                <TemplateKindIcons objects={objects.filter(object => selected.has(object.id))} />
                {i18n.formatMessage(templateMessages.objectCount, { count: selected.size })}</span>
            </FieldDescription>}
          </Field> : <>
            <Field>
              <FieldLabel htmlFor={id}>{i18n.text(templateMessages.name)}</FieldLabel>
              <Input ref={nameInput} id={id} value={name} required maxLength={160} disabled={saving}
                onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
                }} />
              {sameName && <FieldDescription className="flex flex-wrap items-center gap-x-2">
                <StatusText tone="neutral">{i18n.text(templateMessages.nameExists)}</StatusText>
                <Button type="button" variant="link" size="xs" className="h-auto p-0" disabled={saving}
                  onClick={() => { setTargetId(sameName.id); setMode("replace"); }}>
                  {i18n.text(templateMessages.replaceExisting)}
                </Button>
              </FieldDescription>}
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
              {saving && <Spinner />}{i18n.text(replacing
                ? saving ? templateMessages.replacing : templateMessages.replace
                : saving ? formsMessages.saving : formsMessages.save)}
            </Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </DialogContent>
  </Dialog>;
}
