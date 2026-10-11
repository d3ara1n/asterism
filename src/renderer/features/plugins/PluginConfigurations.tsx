import { useEffect, useId, useRef, useState } from "react";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import type { PluginConfiguration, PluginConfigurationBridge } from "../../../shared/plugin-configuration";
import { s } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { Textarea } from "../../shared/ui/textarea";
import { Switch } from "../../shared/ui/switch";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "../../shared/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Spinner } from "../../shared/ui/spinner";
import { configurationField, configurationLabel, configurationProperty, objectValue } from "./configuration-fields";

/** 复杂值保留完整文本；无效输入阻止提交，不把部分值或旧值保存为新配置。 */
function JsonInput({ id, value, onChange, required, title, description }: {
  id: string; value: Json | undefined; onChange(value: Json | undefined): void; required: boolean; title: string; description?: string;
}) {
  const [text, setText] = useState(() => value === undefined ? "" : JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  const control = useRef<HTMLTextAreaElement>(null);
  const published = useRef(value);
  useEffect(() => {
    if (value === published.current) return;
    published.current = value;
    setText(value === undefined ? "" : JSON.stringify(value, null, 2));
    setError(null); control.current?.setCustomValidity("");
  }, [value]);
  return <Field data-invalid={!!error}>
    <FieldLabel htmlFor={id}>{title}</FieldLabel>
    {description && <FieldDescription>{description}</FieldDescription>}
    {!required && value === undefined && <FieldDescription>{s("Not set", "未设置")}</FieldDescription>}
    <Textarea ref={control} id={id} value={text} rows={5} required={required} aria-invalid={!!error}
      onChange={event => {
        const raw = event.currentTarget.value;
        setText(raw);
        try {
          const next: Json | undefined = raw.trim() ? jsonSchema.parse(JSON.parse(raw)) : undefined;
          published.current = next; onChange(next); setError(null); event.currentTarget.setCustomValidity("");
        } catch {
          const message = s("Enter a valid JSON value.", "请输入有效的 JSON 值。");
          published.current = undefined; onChange(undefined);
          setError(message); event.currentTarget.setCustomValidity(message);
        }
      }} />
    {error && <FieldError>{error}</FieldError>}
    {!required && value !== undefined && <Button type="button" variant="ghost" size="xs" onClick={() => onChange(undefined)}>{s("Leave unset", "不设置")}</Button>}
  </Field>;
}

function ConfigurationValue({ schema, value, onChange, label, required = true, depth = 0 }: {
  schema: Json | null; value: Json | undefined; onChange(value: Json | undefined): void;
  label: string; required?: boolean; depth?: number;
}) {
  const id = useId();
  const shape = objectValue(schema);
  const description = typeof shape?.description === "string" ? shape.description : undefined;
  const field = depth < 6 ? configurationField(schema) : { kind: "json" as const };
  const title = configurationLabel(schema, label);
  if (field.kind === "object" && required && objectValue(value)) return <FieldSet>
    <FieldLegend variant="label">{title}</FieldLegend>
    {description && <FieldDescription>{description}</FieldDescription>}
    <FieldGroup>{Object.entries(field.properties).map(([name, child]) => <ConfigurationValue key={name} schema={child}
      value={objectValue(value)?.[name]} label={name} required={field.required.includes(name)} depth={depth + 1}
      onChange={next => onChange(configurationProperty(value, name, next))} />)}</FieldGroup>
  </FieldSet>;
  if (field.kind === "json" || field.kind === "object") return <JsonInput id={id} title={title} description={description}
    value={value} onChange={onChange} required={required} />;
  const boolean = field.kind === "boolean";
  return <Field orientation={boolean ? "horizontal" : "vertical"}>
    <FieldContent>
      <FieldLabel htmlFor={id}>{title}</FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      {value === undefined && !required && <FieldDescription>{s("Not set", "未设置")}</FieldDescription>}
    </FieldContent>
    {boolean ? <Switch id={id} checked={value === true} onCheckedChange={onChange} />
      : field.kind === "string" ? <Input id={id} value={typeof value === "string" ? value : ""} required={required && typeof shape?.minLength === "number" && shape.minLength > 0}
        minLength={typeof shape?.minLength === "number" ? shape.minLength : undefined}
        maxLength={typeof shape?.maxLength === "number" ? shape.maxLength : undefined}
        onChange={event => onChange(event.currentTarget.value)} />
        : field.kind === "number" || field.kind === "integer" ? <Input id={id} type="number" value={typeof value === "number" ? value : ""} required={required}
          step={field.kind === "integer" ? 1 : "any"} min={typeof shape?.minimum === "number" ? shape.minimum : undefined}
          max={typeof shape?.maximum === "number" ? shape.maximum : undefined}
          onChange={event => onChange(event.currentTarget.value === "" || !Number.isFinite(event.currentTarget.valueAsNumber) ? undefined : event.currentTarget.valueAsNumber)} />
          : field.kind === "enum" ? <Select value={value === undefined ? "" : JSON.stringify(value)} required={required}
            onValueChange={next => onChange(JSON.parse(next))}>
            <SelectTrigger id={id}><SelectValue placeholder={s("Select a value", "选择值")} /></SelectTrigger>
            <SelectContent><SelectGroup>{field.options.map(option => <SelectItem key={JSON.stringify(option)} value={JSON.stringify(option)}>
              {String(option)}
            </SelectItem>)}</SelectGroup></SelectContent>
          </Select> : null}
    {!required && value !== undefined && <Button type="button" variant="ghost" size="xs" onClick={() => onChange(undefined)}>{s("Leave unset", "不设置")}</Button>}
  </Field>;
}

function ConfigurationForm({ settings, execute, onSaved }: {
  settings: PluginConfiguration; execute: PluginConfigurationBridge["execute"]; onSaved(values: PluginConfiguration[]): void;
}) {
  const [baseline, setBaseline] = useState(settings);
  const [draft, setDraft] = useState<Json | undefined>(() => structuredClone(settings.value));
  const [reset, setReset] = useState(false);
  const [edited, setEdited] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = edited || reset || JSON.stringify(draft) !== JSON.stringify(baseline.value);
  useEffect(() => {
    if (dirty) return;
    setBaseline(settings); setDraft(structuredClone(settings.value)); setVersion(value => value + 1);
  }, [settings, dirty]);
  const save = async () => {
    if (busy || !dirty || draft === undefined) return;
    setBusy(true); setError(null);
    try {
      const result = await execute(reset
        ? { type: "reset", id: settings.id } : { type: "save", id: settings.id, value: draft });
      if (!result.ok) { setError(result.error.message); return; }
      const saved = result.configurations.find(value => value.id === settings.id);
      if (!saved) { setError(s("The plugin configuration is no longer available.", "插件配置已不可用。")); return; }
      setBaseline(saved); setDraft(structuredClone(saved.value)); setReset(false); setEdited(false); setVersion(value => value + 1);
      onSaved(result.configurations);
    } catch { setError(s("Configuration could not be saved. Reload before retrying.", "配置无法保存，请重新读取后再试。")); }
    finally { setBusy(false); }
  };
  return <form onSubmit={event => { event.preventDefault(); void save(); }}>
    <FieldSet disabled={busy}>
      <FieldLegend>{settings.id}</FieldLegend>
      {baseline.status === "invalid" && <Alert><AlertDescription>{s("The saved configuration could not be read. Defaults are shown; saving will replace it.", "已保存配置无法读取，当前显示默认值；保存后会替换原配置。")}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <FieldGroup><ConfigurationValue key={version} schema={settings.schema} value={draft} label={s("Configuration", "配置")}
        onChange={value => { setDraft(value); setReset(false); setEdited(true); setError(null); }} /></FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!dirty || draft === undefined}>{busy && <Spinner data-icon="inline-start" />}{s("Save", "保存")}</Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => {
          setDraft(structuredClone(settings.defaults)); setReset(true); setError(null); setVersion(value => value + 1);
        }}>{s("Restore defaults", "恢复默认值")}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!dirty && !error} onClick={() => {
          setDraft(structuredClone(settings.value)); setBaseline(settings); setReset(false); setEdited(false); setError(null); setVersion(value => value + 1);
        }}>{s("Discard changes", "放弃修改")}</Button>
      </div>
    </FieldSet>
  </form>;
}

export function PluginConfigurations({ values, execute, onSaved }: {
  values: PluginConfiguration[]; execute: PluginConfigurationBridge["execute"]; onSaved(values: PluginConfiguration[]): void;
}) {
  return <div className="flex flex-col gap-6">{values.map(settings => <ConfigurationForm key={settings.id} settings={settings} execute={execute} onSaved={onSaved} />)}</div>;
}
