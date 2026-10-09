import { useId, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../shared/ui/alert-dialog";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Button } from "../../shared/ui/button";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useCloseGuard } from "../../shared/weave/Screen";
import { Field, FieldDescription, FieldLabel } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { Textarea } from "../../shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { Switch } from "../../shared/ui/switch";
import { s, useSettingsConfiguration } from "./state";

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
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type="number" value={value ?? ""} min={min} max={max} step={integer ? 1 : "any"}
    placeholder={placeholder ?? s("Default", "默认")} onChange={event => onChange(event.target.value === "" ? null : Number(event.target.value))} />
    {(onReset || onClear) && <div className="flex flex-wrap gap-2">
      {onReset && <Button type="button" variant="ghost" size="sm" onClick={onReset}>{s("Use built-in", "使用内置值")}</Button>}
      {onClear && <Button type="button" variant="ghost" size="sm" onClick={onClear}>{clearLabel}</Button>}
    </div>}
  </Field>;
}
export function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const id = useId();
  return <Field orientation="horizontal"><FieldLabel htmlFor={id}>{label}</FieldLabel><Switch id={id} checked={value} onCheckedChange={onChange} /></Field>;
}
export function ChoiceField({ label, value, onChange, options, empty }: {
  label: string; value: string | null; onChange: (value: string | null) => void; options: { value: string; label: string; disabled?: boolean }[]; empty?: string;
}) {
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value ?? "__none"} onValueChange={next => onChange(next === "__none" ? null : next)}>
    <SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>
      {empty && <SelectItem value="__none">{empty}</SelectItem>}
      {value && !options.some(option => option.value === value) && <SelectItem value={value} disabled>{s("Unavailable", "不可用")} · {value}</SelectItem>}
      {options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}
    </SelectContent></Select></Field>;
}
export const lines = (value: string): string[] => [...new Set(value.split("\n").map(line => line.trim()).filter(Boolean))];
/** 覆盖表单复用同一选择控件，缺省与显式 null 各有独立选项。 */
export function OverrideChoiceField({ value, inherited, onChange, ...props }: {
  label: string; value: string | null | undefined; inherited: string | null; onChange: (value: string | null | undefined) => void;
  options: { value: string; label: string; disabled?: boolean }[]; empty?: string;
}) {
  const inheritedLabel = props.options.find(option => option.value === inherited)?.label ?? inherited ?? props.empty;
  return <ChoiceField {...props} value={value === undefined ? "__inherit" : value}
    options={[{ value: "__inherit", label: `${s("Built-in", "内置")} · ${inheritedLabel ?? ""}` }, ...props.options]}
    onChange={next => onChange(next === "__inherit" ? undefined : next)} />;
}
export function OverrideToggleField({ value, inherited, onChange, label }: {
  label: string; value: boolean | undefined; inherited: boolean; onChange: (value: boolean | undefined) => void;
}) {
  return <OverrideChoiceField label={label} value={value === undefined ? undefined : String(value)} inherited={String(inherited)}
    options={[{ value: "true", label: s("Yes", "是") }, { value: "false", label: s("No", "否") }]}
    onChange={next => onChange(next === undefined ? undefined : next === "true")} />;
}
export function OverrideNumberField({ value, inherited, onChange, empty, ...props }: {
  label: string; value: number | null | undefined; inherited: number | null; onChange: (value: number | null | undefined) => void;
  empty: string; min?: number; max?: number; integer?: boolean;
}) {
  return <NumberField {...props} value={value ?? null}
    placeholder={value === null ? empty : `${s("Built-in", "内置")} · ${inherited ?? empty}`}
    onChange={next => onChange(next ?? undefined)}
    onReset={value !== undefined ? () => onChange(undefined) : undefined}
    onClear={value !== null ? () => onChange(null) : undefined} clearLabel={empty} />;
}
/** 列表缺省继承，显式空列表清空；不以空文本猜测列表策略。 */
export function OverrideListField({ label, value, inherited, onChange, empty, hint }: {
  label: string; value: string[] | undefined; inherited: string[]; onChange: (value: string[] | undefined) => void; empty: string; hint?: string;
}) {
  return <>
    <OverrideChoiceField label={label} value={value === undefined ? undefined : value.length ? "list" : "none"}
      inherited={inherited.length ? inherited.join(" · ") : "none"}
      options={[{ value: "none", label: empty }, { value: "list", label: s("Custom list", "自定义列表") }]}
      onChange={next => onChange(next === undefined ? undefined : next === "none" ? [] : [...(inherited.length ? inherited : [""])])} />
    {value !== undefined && value.length > 0 && <TextField label={s("Items (one per line)", "列表项（每行一项）")}
      value={value.join("\n")} placeholder={inherited.join("\n")} onChange={next => onChange(next.split("\n"))} multiline hint={hint} />}
  </>;
}
/**
 * 配置编辑器：套用面板浮岛；保存位于标题栏，经 form 属性提交内容区中的表单。
 * 传入 dirty 时：无修改禁用保存；有修改时关闭本浮岛（含上级关闭或替换）先确认放弃。
 */
export interface RemoveAction { title: string; description: string; onConfirm: () => void }
export function Editor({ title, description, form, dirty, remove, children }: { title: string; description?: string; form: string; dirty?: boolean; remove?: RemoveAction; children: ReactNode }) {
  const { busy } = useSettingsConfiguration();
  const [asking, setAsking] = useState<((discard: boolean) => void) | null>(null);
  const [removing, setRemoving] = useState(false);
  useCloseGuard(dirty ? () => new Promise<boolean>(resolve => setAsking(() => resolve)) : null);
  const answer = (discard: boolean) => { asking?.(discard); setAsking(null); };
  return <IslandPanel title={title} description={description}
    action={<>
      {remove && <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" aria-label={s("Delete", "删除")} title={s("Delete", "删除")} disabled={busy} onClick={() => setRemoving(true)}><Trash2 /></Button>}
      <Button type="submit" form={form} size="sm" disabled={busy || dirty === false}>{busy ? s("Saving…", "正在保存…") : s("Save", "保存")}</Button>
    </>}>
    <ConfigurationStatus />{children}
    {remove && <AlertDialog open={removing} onOpenChange={setRemoving}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{remove.title}</AlertDialogTitle>
          <AlertDialogDescription>{remove.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{s("Cancel", "取消")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove.onConfirm}>{s("Delete", "删除")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
    <AlertDialog open={asking !== null} onOpenChange={open => { if (!open) answer(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{s("Discard unsaved changes?", "放弃未保存的修改？")}</AlertDialogTitle>
          <AlertDialogDescription>{s("Changes in “{title}” have not been saved.", "「{title}」中的修改尚未保存。").replace("{title}", title)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{s("Keep editing", "继续编辑")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => answer(true)}>{s("Discard", "放弃")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </IslandPanel>;
}
/** 次要的删除操作随表单内容放在末尾。 */
export function SaveActions({ onRemove, cannotRemove = false, onReset }: { onRemove?: () => void; cannotRemove?: boolean; onReset?: () => void }) {
  const { busy } = useSettingsConfiguration();
  if (!onRemove && !cannotRemove && !onReset) return null;
  return <div className="mt-5 flex items-center gap-3">
    {onRemove && <Button type="button" variant="ghost" className="-ml-2 text-destructive" disabled={busy || cannotRemove} onClick={onRemove}>{s("Delete", "删除")}</Button>}
    {cannotRemove && <span className="type-caption">{s("Built-in role", "内置角色")}</span>}
    {onReset && <Button type="button" variant="ghost" disabled={busy} onClick={onReset}>{s("Restore built-in values", "恢复内置值")}</Button>}
  </div>;
}
export function ConfigurationStatus() {
  const { snapshot, error, load } = useSettingsConfiguration();
  if (error) return <Alert variant="destructive" className="mb-4"><AlertDescription>{error}<Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>{s("Reload", "重新读取")}</Button></AlertDescription></Alert>;
  return !snapshot ? <p role="status" className="type-caption py-4">{s("Loading configuration…", "正在读取配置…")}</p> : null;
}
