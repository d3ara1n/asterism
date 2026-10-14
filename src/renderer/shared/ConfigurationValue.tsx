import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { jsonSchema, type UiText, type Json, type ConfigurationPresentation } from "@atelier/sdk/contracts";
import { pointerChild } from "../../shared/configuration-presentation";
import { configurationField, configurationLabel, configurationProperty, objectValue } from "../../shared/configuration-fields";
import { pluginConfigurationMessages } from "../messages/plugin-configuration";
import { useI18n } from "./i18n";
import { Field, FieldLabel, FieldDescription, FieldError, FieldSet, FieldLegend, FieldGroup, FieldContent } from "./ui/field";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "./ui/select";

/** 复杂值保留完整文本；无效输入阻止提交，不把部分值或旧值保存为新配置。 */
function JsonInput({ id, value, onChange, required, title, description, actions }: {
  id: string; value: Json | undefined; onChange(value: Json | undefined): void; required: boolean; title: string; description?: string; actions?: ReactNode;
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
    {actions ? <div className="flex items-center justify-between gap-2"><FieldLabel htmlFor={id}>{title}</FieldLabel>{actions}</div>
      : <FieldLabel htmlFor={id}>{title}</FieldLabel>}
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

export function ConfigurationValue({ schema, value, onChange, label, required = true, depth = 0, presentation, path = "", actions }: {
  schema: Json | null; value: Json | undefined; onChange(value: Json | undefined): void;
  label: string; required?: boolean; depth?: number; presentation?: ConfigurationPresentation; path?: string; actions?: ReactNode;
}) {
  const id = useId();
  const i18n = useI18n(), display = presentation?.fields[path];
  const shape = objectValue(schema);
  const description = display?.description !== undefined ? i18n.text(display.description) : typeof shape?.description === "string" ? shape.description : undefined;
  const field = depth < 6 ? configurationField(schema) : { kind: "json" as const };
  const title = display?.title !== undefined ? i18n.text(display.title) : configurationLabel(schema, label);
  if (field.kind === "object" && required && objectValue(value)) return <FieldSet>
    <FieldLegend variant="label" className={actions ? "flex w-full items-center justify-between gap-2" : undefined}>
      {title}{actions}
    </FieldLegend>
    {description && <FieldDescription>{description}</FieldDescription>}
    <FieldGroup>{Object.entries(field.properties).map(([name, child]) => <ConfigurationValue key={name} schema={child}
      value={objectValue(value)?.[name]} label={name} required={field.required.includes(name)} depth={depth + 1}
      presentation={presentation} path={pointerChild(path, name)}
      onChange={next => onChange(configurationProperty(value, name, next))} />)}</FieldGroup>
  </FieldSet>;
  if (field.kind === "json" || field.kind === "object") return <JsonInput id={id} title={title} description={description}
    value={value} onChange={onChange} required={required} actions={actions} />;
  const boolean = field.kind === "boolean";
  return <Field orientation={boolean ? "horizontal" : "vertical"}>
    <FieldContent>
      {actions ? <div className="flex items-center justify-between gap-2"><FieldLabel htmlFor={id}>{title}</FieldLabel>{actions}</div>
        : <FieldLabel htmlFor={id}>{title}</FieldLabel>}
      {description && <FieldDescription>{description}</FieldDescription>}
      {value === undefined && !required && <FieldDescription>{i18n.formatMessage(pluginConfigurationMessages.notSetOption)}</FieldDescription>}
    </FieldContent>
    {boolean ? <Switch id={id} checked={value === true} onCheckedChange={onChange} />
      : field.kind === "string" ? <Input id={id} value={typeof value === "string" ? value : ""} required={required && typeof shape?.minLength === "number" && shape.minLength > 0}
        minLength={typeof shape?.minLength === "number" ? shape.minLength : undefined}
        maxLength={typeof shape?.maxLength === "number" ? shape.maxLength : undefined}
        onChange={event => {
          const next = event.currentTarget.value;
          onChange(!required && next === "" && typeof shape?.minLength === "number" && shape.minLength > 0 ? undefined : next);
        }} />
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

