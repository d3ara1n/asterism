import { Field, FieldLabel, FieldDescription, FieldError, FieldSet, FieldLegend, FieldGroup, FieldContent } from "../../shared/ui/field";

import { Textarea } from "../../shared/ui/textarea";

import { Button } from "../../shared/ui/button";

import { Switch } from "../../shared/ui/switch";
import { Input } from "../../shared/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "../../shared/ui/select";

import { Alert, AlertDescription } from "../../shared/ui/alert";

import { Spinner } from "../../shared/ui/spinner";
import { errorDisplay } from "../../../shared/error-display.ts";
import { jsonSchema, type UiText, type Json, type ConfigurationPresentation } from "@atelier/sdk/contracts";
import { pluginConfigurationMessages } from "../../messages/plugin-configuration";
import { useI18n } from "../../shared/i18n";
import { useEffect, useId, useRef, useState } from "react";

import { pointerChild } from "../../../shared/configuration-presentation";
import type { PluginConfiguration, PluginConfigurationBridge } from "../../../shared/plugin-configuration";

import { configurationField, configurationLabel, configurationProperty, objectValue } from "./configuration-fields";

/** 复杂值保留完整文本；无效输入阻止提交，不把部分值或旧值保存为新配置。 */
function JsonInput({ id, value, onChange, required, title, description }: {
  id: string; value: Json | undefined; onChange(value: Json | undefined): void; required: boolean; title: string; description?: string;
}) {
  const i18n = useI18n();
  const [text, setText] = useState(() => value === undefined ? "" : JSON.stringify(value, null, 2));
  const [error, setError] = useState<UiText | null>(null);
  const control = useRef<HTMLTextAreaElement>(null);
  const published = useRef(value);
  useEffect(() => {
    if (value === published.current) return;
    published.current = value;
    setText(value === undefined ? "" : JSON.stringify(value, null, 2));
    setError(null); control.current?.setCustomValidity("");
  }, [value]);
  useEffect(() => { control.current?.setCustomValidity(error ? i18n.text(error) : ""); }, [error, i18n]);
  return <Field data-invalid={!!error}>
    <FieldLabel htmlFor={id}>{title}</FieldLabel>
    {description && <FieldDescription>{description}</FieldDescription>}
    {!required && value === undefined && <FieldDescription>{i18n.formatMessage(pluginConfigurationMessages.notSet)}</FieldDescription>}
    <Textarea ref={control} id={id} value={text} rows={5} required={required} aria-invalid={!!error}
      onChange={event => {
        const raw = event.currentTarget.value;
        setText(raw);
        try {
          const next: Json | undefined = raw.trim() ? jsonSchema.parse(JSON.parse(raw)) : undefined;
          published.current = next; onChange(next); setError(null); event.currentTarget.setCustomValidity("");
        } catch {
          const message = pluginConfigurationMessages.invalidJson;
          published.current = undefined; onChange(undefined);
          setError(message); event.currentTarget.setCustomValidity(i18n.text(message));
        }
      }} />
    {error && <FieldError>{i18n.text(error)}</FieldError>}
    {!required && value !== undefined && <Button type="button" variant="ghost" size="xs" onClick={() => onChange(undefined)}>{i18n.formatMessage(pluginConfigurationMessages.leaveUnset)}</Button>}
  </Field>;
}

function ConfigurationValue({ schema, value, onChange, label, required = true, depth = 0, presentation, path = "" }: {
  schema: Json | null; value: Json | undefined; onChange(value: Json | undefined): void;
  label: string; required?: boolean; depth?: number; presentation?: ConfigurationPresentation; path?: string;
}) {
  const id = useId();
  const i18n = useI18n(), display = presentation?.fields[path];
  const shape = objectValue(schema);
  const description = display?.description !== undefined ? i18n.text(display.description) : typeof shape?.description === "string" ? shape.description : undefined;
  const field = depth < 6 ? configurationField(schema) : { kind: "json" as const };
  const title = display?.title !== undefined ? i18n.text(display.title) : configurationLabel(schema, label);
  if (field.kind === "object" && required && objectValue(value)) return <FieldSet>
    <FieldLegend variant="label">{title}</FieldLegend>
    {description && <FieldDescription>{description}</FieldDescription>}
    <FieldGroup>{Object.entries(field.properties).map(([name, child]) => <ConfigurationValue key={name} schema={child}
      value={objectValue(value)?.[name]} label={name} required={field.required.includes(name)} depth={depth + 1}
      presentation={presentation} path={pointerChild(path, name)}
      onChange={next => onChange(configurationProperty(value, name, next))} />)}</FieldGroup>
  </FieldSet>;
  if (field.kind === "json" || field.kind === "object") return <JsonInput id={id} title={title} description={description}
    value={value} onChange={onChange} required={required} />;
  const boolean = field.kind === "boolean";
  return <Field orientation={boolean ? "horizontal" : "vertical"}>
    <FieldContent>
      <FieldLabel htmlFor={id}>{title}</FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      {value === undefined && !required && <FieldDescription>{i18n.formatMessage(pluginConfigurationMessages.notSetOption)}</FieldDescription>}
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
            <SelectTrigger id={id}><SelectValue placeholder={i18n.formatMessage(pluginConfigurationMessages.selectValue)} /></SelectTrigger>
            <SelectContent><SelectGroup>{field.options.map(option => <SelectItem key={JSON.stringify(option)} value={JSON.stringify(option)}>
              {(() => { const translated = display?.enumLabels?.find(entry => entry.value === option); return translated ? i18n.text(translated.label) : String(option); })()}
            </SelectItem>)}</SelectGroup></SelectContent>
          </Select> : null}
    {!required && value !== undefined && <Button type="button" variant="ghost" size="xs" onClick={() => onChange(undefined)}>{i18n.formatMessage(pluginConfigurationMessages.leaveUnsetOption)}</Button>}
  </Field>;
}

function ConfigurationForm({ settings, execute, onSaved }: {
  settings: PluginConfiguration; execute: PluginConfigurationBridge["execute"]; onSaved(values: PluginConfiguration[]): void;
}) {
  const i18n = useI18n();
  const [baseline, setBaseline] = useState(settings);
  const [draft, setDraft] = useState<Json | undefined>(() => structuredClone(settings.value));
  const [reset, setReset] = useState(false);
  const [edited, setEdited] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
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
      if (!result.ok) { setError(errorDisplay(result.error)); return; }
      const saved = result.configurations.find(value => value.id === settings.id);
      if (!saved) { setError(pluginConfigurationMessages.unavailable); return; }
      setBaseline(saved); setDraft(structuredClone(saved.value)); setReset(false); setEdited(false); setVersion(value => value + 1);
      onSaved(result.configurations);
    } catch { setError(pluginConfigurationMessages.saveFailed); }
    finally { setBusy(false); }
  };
  return <form onSubmit={event => { event.preventDefault(); void save(); }}>
    <FieldSet disabled={busy}>
      <FieldLegend>{settings.id}</FieldLegend>
      {baseline.status === "invalid" && <Alert><AlertDescription>{i18n.formatMessage(pluginConfigurationMessages.readFailed)}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
      <FieldGroup><ConfigurationValue key={version} schema={settings.schema} value={draft} label={i18n.formatMessage(pluginConfigurationMessages.configuration)}
        presentation={settings.presentation}
        onChange={value => { setDraft(value); setReset(false); setEdited(true); setError(null); }} /></FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!dirty || draft === undefined}>{busy && <Spinner data-icon="inline-start" />}{i18n.formatMessage(pluginConfigurationMessages.save)}</Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => {
          setDraft(structuredClone(settings.defaults)); setReset(true); setError(null); setVersion(value => value + 1);
        }}>{i18n.formatMessage(pluginConfigurationMessages.restoreDefaults)}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!dirty && !error} onClick={() => {
          setDraft(structuredClone(settings.value)); setBaseline(settings); setReset(false); setEdited(false); setError(null); setVersion(value => value + 1);
        }}>{i18n.formatMessage(pluginConfigurationMessages.discardChanges)}</Button>
      </div>
    </FieldSet>
  </form>;
}

export function PluginConfigurations({ values, execute, onSaved }: {
  values: PluginConfiguration[]; execute: PluginConfigurationBridge["execute"]; onSaved(values: PluginConfiguration[]): void;
}) {

  return <div className="flex flex-col gap-6">{values.map(settings => <ConfigurationForm key={settings.id} settings={settings} execute={execute} onSaved={onSaved} />)}</div>;
}
