import { ChevronDown, RotateCcw, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode, type ComponentType } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";

import { formsMessages } from "./messages/forms";
import { useI18n, IslandPanel, type RendererIslandPanelProps } from "@asterism-app/sdk/renderer";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@asterism-app/ui/ui/alert-dialog";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism-app/ui/ui/collapsible";
import { Field, FieldLabel, FieldDescription } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from "@asterism-app/ui/ui/input-group";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@asterism-app/ui/ui/select";
import { Separator } from "@asterism-app/ui/ui/separator";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Textarea } from "@asterism-app/ui/ui/textarea";

export function TextField({ label, value, onChange, multiline = false, required = false, hint, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; required?: boolean; hint?: string; placeholder?: string;
}) {

  const id = useId();
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>
    {multiline ? <Textarea id={id} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} required={required} rows={5} />
      : <Input id={id} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} required={required} maxLength={160} />}
    {hint && <FieldDescription>{hint}</FieldDescription>}
  </Field>;
}
export function NumberField({ label, value, onChange, min = 0, max, integer = false, placeholder, onReset, onClear, clearLabel }: {
  label: string; value: number | null; onChange: (value: number | null) => void; min?: number; max?: number; integer?: boolean;
  placeholder?: string; onReset?: () => void; onClear?: () => void; clearLabel?: string;
}) {
  const i18n = useI18n();
  const id = useId();
  // InputGroup composition: remove native stepper arrows and place reset/clear as additional buttons inside the input.
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><InputGroup>
    <InputGroupInput id={id} type="number" inputMode={integer ? "numeric" : "decimal"} value={value ?? ""} min={min} max={max} step={integer ? 1 : "any"}
      className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      placeholder={placeholder ?? i18n.formatMessage(formsMessages.default)} onChange={event => onChange(event.target.value === "" ? null : Number(event.target.value))} />
    {(onReset || onClear) && <InputGroupAddon align="inline-end">
      {onReset && <InputGroupButton onClick={onReset}>{i18n.formatMessage(formsMessages.useBuiltin)}</InputGroupButton>}
      {onClear && <InputGroupButton onClick={onClear}>{clearLabel}</InputGroupButton>}
    </InputGroupAddon>}
  </InputGroup></Field>;
}
export function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {

  const id = useId();
  return <Field orientation="horizontal"><FieldLabel htmlFor={id}>{label}</FieldLabel><Switch id={id} checked={value} onCheckedChange={onChange} /></Field>;
}
export function ChoiceField({ label, value, onChange, options, empty }: {
  label: string; value: string | null; onChange: (value: string | null) => void; options: { value: string; label: string; disabled?: boolean }[]; empty?: string;
}) {
  const i18n = useI18n();
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value ?? "__none"} onValueChange={next => onChange(next === "__none" ? null : next)}>
    <SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>
      {empty && <SelectItem value="__none">{empty}</SelectItem>}
      {value && !options.some(option => option.value === value) && <SelectItem value={value} disabled>{i18n.formatMessage(formsMessages.unavailable)} · {value}</SelectItem>}
      {options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}
    </SelectContent></Select></Field>;
}
export const lines = (value: string): string[] => [...new Set(value.split("\n").map(line => line.trim()).filter(Boolean))];
/** Override forms reuse the same selector, with separate options for unset and explicit null. */
export function OverrideChoiceField({ value, inherited, onChange, ...props }: {
  label: string; value: string | null | undefined; inherited: string | null; onChange: (value: string | null | undefined) => void;
  options: { value: string; label: string; disabled?: boolean }[]; empty?: string;
}) {
  const i18n = useI18n();
  const inheritedLabel = props.options.find(option => option.value === inherited)?.label ?? inherited ?? props.empty;
  return <ChoiceField {...props} value={value === undefined ? "__inherit" : value}
    options={[{ value: "__inherit", label: `${i18n.formatMessage(formsMessages.builtin)} · ${inheritedLabel ?? ""}` }, ...props.options]}
    onChange={next => onChange(next === "__inherit" ? undefined : next)} />;
}
/** Switches show effective values; write an override only when different from the built-in value, and show “Modified · Reset”. */
export function OverrideToggleField({ value, inherited, onChange, label, hint }: {
  label: string; value: boolean | undefined; inherited: boolean; onChange: (value: boolean | undefined) => void; hint?: string;
}) {
  const id = useId();
  const effective = value ?? inherited;
  const modified = value !== undefined && value !== inherited;
  return <Field orientation="horizontal">
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {modified && <ModifiedNote onRestore={() => onChange(undefined)} />}
    </div>
    <Switch id={id} checked={effective} onCheckedChange={next => onChange(next === inherited ? undefined : next)} />
  </Field>;
}
/** Unset lists inherit, and explicit empty lists clear; do not infer list policy from empty text. */
export function OverrideListField({ label, value, inherited, onChange, empty, hint }: {
  label: string; value: string[] | undefined; inherited: string[]; onChange: (value: string[] | undefined) => void; empty: string; hint?: string;
}) {
  const i18n = useI18n();
  return <>
    <OverrideChoiceField label={label} value={value === undefined ? undefined : value.length ? "list" : "none"}
      inherited={inherited.length ? inherited.join(" · ") : "none"}
      options={[{ value: "none", label: empty }, { value: "list", label: i18n.formatMessage(formsMessages.customList) }]}
      onChange={next => onChange(next === undefined ? undefined : next === "none" ? [] : [...(inherited.length ? inherited : [""])])} />
    {value !== undefined && value.length > 0 && <TextField label={i18n.formatMessage(formsMessages.items)}
      value={value.join("\n")} placeholder={inherited.join("\n")} onChange={next => onChange(next.split("\n"))} multiline hint={hint} />}
  </>;
}
/**
 * Configuration editor: uses a panel island; Save sits in the titlebar and submits the content area's form through the form attribute.
 * When dirty is supplied: disable Save without changes; with changes, the panel island confirms discarding before closing.
 * busy / error come from this form's operation instance; disabled represents other operations in the same editor occupying the form.
 */
export interface RemoveAction { title: string; description: string; onConfirm: () => void }
export function Editor({ title, description, form, dirty, busy, error, disabled = false, saveDisabled = false, remove, restore, children, Panel = IslandPanel }: {
  title: string; description?: string; form: string; dirty?: boolean; busy: boolean; error: UiText | null; disabled?: boolean; saveDisabled?: boolean;
  remove?: RemoveAction; restore?: () => void; children: ReactNode; Panel?: ComponentType<RendererIslandPanelProps>;
}) {
  const i18n = useI18n();
  const [removing, setRemoving] = useState(false);
  return <Panel title={title} description={description} dirty={dirty}
    action={<>
      {restore && <IconButton type="button" label={i18n.formatMessage(formsMessages.restoreAll)} tooltip={i18n.formatMessage(formsMessages.restoreAllLabel)} disabled={busy || disabled} onClick={restore}><RotateCcw /></IconButton>}
      {remove && <IconButton type="button" className="text-destructive" label={i18n.formatMessage(formsMessages.deleteLabel)} tooltip={i18n.formatMessage(formsMessages.deleteButton)} disabled={busy || disabled} onClick={() => setRemoving(true)}><Trash2 /></IconButton>}
      <Button type="submit" form={form} size="sm" disabled={busy || disabled || saveDisabled || dirty === false}>{busy ? i18n.formatMessage(formsMessages.saving) : i18n.formatMessage(formsMessages.save)}</Button>
    </>}>
    <ConfigurationActionError error={error} />{children}
    {remove && <AlertDialog open={removing} onOpenChange={setRemoving}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{remove.title}</AlertDialogTitle>
          <AlertDialogDescription>{remove.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{i18n.formatMessage(formsMessages.cancel)}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove.onConfirm}>{i18n.formatMessage(formsMessages.delete)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </Panel>;
}
/** Forms and sections explicitly display failures from their own operations; retries start at the original operation entry. */
export function ConfigurationActionError({ error }: { error: UiText | null }) {
  const i18n = useI18n();
  return error && <Alert variant="destructive" className="mb-4"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>;
}

/** “Modified · Reset” when a field differs from its built-in or inherited value. */
export function ModifiedNote({ onRestore }: { onRestore: () => void }) {
  const i18n = useI18n();
  return <span className="type-caption">{i18n.formatMessage(formsMessages.modified)} · <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRestore}>{i18n.formatMessage(formsMessages.restore)}</Button></span>;
}
/**
 * Editor section: title, description, and actions on the right; sections are separated by dividers, with none before the first.
 * When collapsible, the title toggles expansion; description, actions, and operation results (status) remain visible when collapsed, and only the body collapses.
 */
export function EditorSection({ title, hint, action, status, collapsible = false, defaultOpen = true, children }: {
  title: string; hint?: ReactNode; action?: ReactNode; status?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const heading = collapsible
    ? <h3><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className="-ml-2">
      <ChevronDown className={open ? "transition-transform" : "-rotate-90 transition-transform"} /><span className="type-section">{title}</span>
    </Button></CollapsibleTrigger></h3>
    : <h3 className="type-section">{title}</h3>;
  const body = <>
    <div className="flex min-h-8 items-center justify-between gap-3">{heading}{action && <div className="flex flex-wrap justify-end gap-2">{action}</div>}</div>
    {hint && <div className="type-caption -mt-2">{hint}</div>}
    {status}
    {collapsible ? <CollapsibleContent className="flex flex-col gap-3">{children}</CollapsibleContent> : children}
  </>;
  return <section className="group/editor-section mt-6 flex flex-col gap-3 first:mt-0">
    <Separator className="mb-2 group-first/editor-section:hidden" />
    {collapsible ? <Collapsible open={open} onOpenChange={setOpen} className="contents">{body}</Collapsible> : body}
  </section>;
}

/** Loading and failed-read presentation for configuration-dependent sections; each caller supplies its own read state. */
export function ReadStatus({ loaded, error, onRetry }: { loaded: boolean; error: UiText | null; onRetry(): void }) {
  const i18n = useI18n();
  if (error) return <Alert variant="destructive" className="mb-4"><AlertDescription>{i18n.text(error)}
    <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>{i18n.text(formsMessages.reload)}</Button></AlertDescription></Alert>;
  return loaded ? null : <p role="status" className="type-caption flex items-center gap-2 py-4"><Spinner aria-hidden="true" />{i18n.text(formsMessages.loading)}</p>;
}
