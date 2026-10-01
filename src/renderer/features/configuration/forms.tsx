import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, IconButton } from "../../shared/ui/button";
import { useIsland } from "../../shared/weave/Screen";
import { Field, FieldDescription, FieldLabel } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { Textarea } from "../../shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { Switch } from "../../shared/ui/switch";
import { s, useSettingsConfiguration } from "./state";

export function TextField({ label, value, onChange, multiline = false, required = false, hint }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; required?: boolean; hint?: string;
}) {
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>
    {multiline ? <Textarea id={id} value={value} onChange={event => onChange(event.target.value)} required={required} rows={5} />
      : <Input id={id} value={value} onChange={event => onChange(event.target.value)} required={required} maxLength={160} />}
    {hint && <FieldDescription>{hint}</FieldDescription>}
  </Field>;
}
export function NumberField({ label, value, onChange, min = 0, max, integer = false }: {
  label: string; value: number | null; onChange: (value: number | null) => void; min?: number; max?: number; integer?: boolean;
}) {
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type="number" value={value ?? ""} min={min} max={max} step={integer ? 1 : "any"}
    placeholder={s("Default", "默认")} onChange={event => onChange(event.target.value === "" ? null : Number(event.target.value))} /></Field>;
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
export function Editor({ title, children }: { title: string; children: ReactNode }) {
  const island = useIsland();
  return <div className="p-6"><header className="mb-5 flex items-center justify-between gap-3"><h2 className="type-section">{title}</h2>
    <IconButton label={s("Close", "关闭")} onClick={island.close}><X /></IconButton></header><ConfigurationStatus />{children}</div>;
}
export function SaveActions({ onRemove, cannotRemove = false }: { onRemove?: () => void; cannotRemove?: boolean }) {
  const { busy } = useSettingsConfiguration();
  return <div className="mt-5 flex items-center justify-between gap-3">
    <Button type="submit" disabled={busy}>{busy ? s("Saving…", "正在保存…") : s("Save", "保存")}</Button>
    {onRemove && <Button type="button" variant="ghost" disabled={busy || cannotRemove} onClick={onRemove}>{s("Delete", "删除")}</Button>}
    {cannotRemove && <span className="type-caption">{s("Built-in role", "内置角色")}</span>}
  </div>;
}
export function ConfigurationStatus() {
  const { snapshot, error, load } = useSettingsConfiguration();
  if (error) return <div role="alert" className="notice notice-error mb-4"><p>{error}</p><Button variant="ghost" onClick={() => void load()}>{s("Reload", "重新读取")}</Button></div>;
  return !snapshot ? <p role="status" className="type-caption py-4">{s("Loading configuration…", "正在读取配置…")}</p> : null;
}
