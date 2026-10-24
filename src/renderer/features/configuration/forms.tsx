import { ChevronDown, RotateCcw, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { UiText } from "@atelier/sdk/contracts";

import { formsMessages } from "../../messages/forms";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "@atelier/ui/ui/alert";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@atelier/ui/ui/alert-dialog";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@atelier/ui/ui/collapsible";
import { Field, FieldLabel, FieldDescription } from "@atelier/ui/ui/field";
import { Input } from "@atelier/ui/ui/input";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from "@atelier/ui/ui/input-group";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@atelier/ui/ui/select";
import { Separator } from "@atelier/ui/ui/separator";
import { Spinner } from "@atelier/ui/ui/spinner";
import { Switch } from "@atelier/ui/ui/switch";
import { Textarea } from "@atelier/ui/ui/textarea";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useSettingsConfiguration } from "./state";

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
  // InputGroup 组合：去掉原生步进箭头，恢复/清除作为输入框内的附加按钮。
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
/** 覆盖表单复用同一选择控件，缺省与显式 null 各有独立选项。 */
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
/** 开关显示生效值；与内置值不同才写覆盖，并给出“已修改 · 恢复”。 */
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
export function OverrideNumberField({ value, inherited, onChange, empty, ...props }: {
  label: string; value: number | null | undefined; inherited: number | null; onChange: (value: number | null | undefined) => void;
  empty: string; min?: number; max?: number; integer?: boolean;
}) {
  const i18n = useI18n();
  return <NumberField {...props} value={value ?? null}
    placeholder={value === null ? empty : `${i18n.formatMessage(formsMessages.builtinList)} · ${inherited ?? empty}`}
    onChange={next => onChange(next ?? undefined)}
    onReset={value !== undefined ? () => onChange(undefined) : undefined}
    onClear={value !== null ? () => onChange(null) : undefined} clearLabel={empty} />;
}
/** 列表缺省继承，显式空列表清空；不以空文本猜测列表策略。 */
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
 * 配置编辑器：套用面板浮岛；保存位于标题栏，经 form 属性提交内容区中的表单。
 * 传入 dirty 时：无修改禁用保存；有修改时由面板浮岛在关闭前确认放弃。
 * busy / error 来自本表单的操作实例；disabled 表达同一编辑器内其他操作对表单的占用。
 */
export interface RemoveAction { title: string; description: string; onConfirm: () => void }
export function Editor({ title, description, form, dirty, busy, error, disabled = false, saveDisabled = false, remove, restore, children }: {
  title: string; description?: string; form: string; dirty?: boolean; busy: boolean; error: UiText | null; disabled?: boolean; saveDisabled?: boolean;
  remove?: RemoveAction; restore?: () => void; children: ReactNode;
}) {
  const i18n = useI18n();
  const [removing, setRemoving] = useState(false);
  return <IslandPanel title={title} description={description} dirty={dirty}
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
  </IslandPanel>;
}
/** 表单与区块显式呈现所属操作的失败；重试由原操作入口发起。 */
export function ConfigurationActionError({ error }: { error: UiText | null }) {
  const i18n = useI18n();
  return error && <Alert variant="destructive" className="mb-4"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>;
}

/** 共享读取状态由设置分类页承接一次。 */
export function ConfigurationReadStatus() {
  const i18n = useI18n();
  const { snapshot, readError, load } = useSettingsConfiguration();
  if (readError) return <Alert variant="destructive" className="mb-4"><AlertDescription>{i18n.text(readError)}<Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>{i18n.formatMessage(formsMessages.reload)}</Button></AlertDescription></Alert>;
  return !snapshot ? <p role="status" className="type-caption flex items-center gap-2 py-4"><Spinner aria-hidden="true" />{i18n.formatMessage(formsMessages.loading)}</p> : null;
}
/** 字段偏离内置或继承值时的“已修改 · 恢复”。 */
export function ModifiedNote({ onRestore }: { onRestore: () => void }) {
  const i18n = useI18n();
  return <span className="type-caption">{i18n.formatMessage(formsMessages.modified)} · <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRestore}>{i18n.formatMessage(formsMessages.restore)}</Button></span>;
}
/**
 * 编辑器区块：标题、说明与右侧操作，区块之间以分隔线隔开，首个区块不带分隔线。
 * collapsible 时标题即展开开关；说明、操作与操作结果（status）在折叠时仍可见，只有正文随折叠收起。
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
