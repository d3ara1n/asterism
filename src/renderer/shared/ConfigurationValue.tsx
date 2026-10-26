import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { jsonSchema, type UiText, type Json } from "@asterism/sdk/contracts";
import { configurationField, configurationLabel, configurationProperty, objectValue } from "../../shared/configuration-fields";
import { configurationFieldMessages } from "../messages/configuration-fields";
import { useI18n } from "./i18n";
import { Field, FieldLabel, FieldDescription, FieldError, FieldSet, FieldLegend, FieldGroup, FieldContent } from "@asterism/ui/ui/field";
import { Textarea } from "@asterism/ui/ui/textarea";
import { Button } from "@asterism/ui/ui/button";
import { Switch } from "@asterism/ui/ui/switch";
import { Input } from "@asterism/ui/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "@asterism/ui/ui/select";
import { cn } from "@asterism/ui/utils";

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
    {!required && value === undefined && <FieldDescription>{i18n.formatMessage(configurationFieldMessages.notSet)}</FieldDescription>}
    <Textarea ref={control} id={id} value={text} rows={5} required={required} aria-invalid={!!error}
      onChange={event => {
        const raw = event.currentTarget.value;
        setText(raw);
        try {
          const next: Json | undefined = raw.trim() ? jsonSchema.parse(JSON.parse(raw)) : undefined;
          published.current = next; onChange(next); setError(null); event.currentTarget.setCustomValidity("");
        } catch {
          const message = configurationFieldMessages.invalidJson;
          published.current = undefined; onChange(undefined);
          setError(message); event.currentTarget.setCustomValidity(i18n.text(message));
        }
      }} />
    {error && <FieldError>{i18n.text(error)}</FieldError>}
    {!required && value !== undefined && <Button type="button" variant="ghost" size="xs" onClick={() => onChange(undefined)}>{i18n.formatMessage(configurationFieldMessages.leaveUnset)}</Button>}
  </Field>;
}

export function ConfigurationValue({ schema, value, onChange, label, required = true, depth = 0, actions }: {
  schema: Json | null; value: Json | undefined; onChange(value: Json | undefined): void;
  label: string; required?: boolean; depth?: number; actions?: ReactNode;
}) {
  const id = useId();
  const i18n = useI18n();
  const shape = objectValue(schema);
  const description = typeof shape?.description === "string" ? shape.description : undefined;
  const field = depth < 6 ? configurationField(schema) : { kind: "json" as const };
  const title = configurationLabel(schema, label);
  const object = objectValue(value);
  if (field.kind === "object" && required && object) {
    return <FieldSet>
      <FieldLegend variant="label" className={cn(actions && "flex w-full items-center justify-between gap-2")}>
        {title}{actions}
      </FieldLegend>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldGroup>{Object.entries(field.properties).map(([name, child]) =>
        <ConfigurationValue key={name} schema={child} value={object[name]} label={name}
          required={field.required.includes(name)} depth={depth + 1}
          onChange={next => onChange(configurationProperty(value, name, next))} />)}</FieldGroup>
    </FieldSet>;
  }
  if (field.kind === "json" || field.kind === "object") return <JsonInput id={id} title={title} description={description}
    value={value} onChange={onChange} required={required} actions={actions} />;
  if (field.kind === "nullable-string") {
    const textShape = objectValue(field.schema);
    return <Field>
      <FieldLabel htmlFor={id}>{title}</FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      <div className="flex min-w-0 items-center gap-2">
        <Select value={value === undefined ? "unset" : value === null ? "null" : "value"}
          onValueChange={mode => onChange(mode === "unset" ? undefined : mode === "null" ? null : "")}>
          <SelectTrigger id={id} className="w-fit"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            {!required && <SelectItem value="unset">{i18n.formatMessage(configurationFieldMessages.notSet)}</SelectItem>}
            <SelectItem value="null">{i18n.formatMessage(configurationFieldMessages.nullValue)}</SelectItem>
            <SelectItem value="value">{i18n.formatMessage(configurationFieldMessages.customValue)}</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
        {typeof value === "string" && <Input value={value} aria-label={title} required
          minLength={typeof textShape?.minLength === "number" ? textShape.minLength : undefined}
          maxLength={typeof textShape?.maxLength === "number" ? textShape.maxLength : undefined}
          onChange={event => onChange(event.currentTarget.value)} />}
        {actions}
      </div>
    </Field>;
  }
  const boolean = field.kind === "boolean";
  const controlProps = { id, "aria-describedby": description ? `${id}-description` : undefined };
  return <Field orientation={boolean ? "horizontal" : "vertical"}>
    <FieldContent className="min-w-0">
      {actions ? <div className="flex items-center justify-between gap-2"><FieldLabel htmlFor={id}>{title}</FieldLabel>{actions}</div>
        : <FieldLabel htmlFor={id}>{title}</FieldLabel>}
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      {value === undefined && !required && <FieldDescription>{i18n.formatMessage(configurationFieldMessages.notSet)}</FieldDescription>}
    </FieldContent>
    <div className="flex min-w-0 items-center gap-2">
      {boolean ? <Switch {...controlProps} checked={value === true} onCheckedChange={onChange} />
        : field.kind === "string" ? <Input {...controlProps} value={typeof value === "string" ? value : ""} required={required && typeof shape?.minLength === "number" && shape.minLength > 0}
          minLength={typeof shape?.minLength === "number" ? shape.minLength : undefined}
          maxLength={typeof shape?.maxLength === "number" ? shape.maxLength : undefined}
          onChange={event => {
            const next = event.currentTarget.value;
            onChange(!required && next === "" && typeof shape?.minLength === "number" && shape.minLength > 0 ? undefined : next);
          }} />
          : field.kind === "number" || field.kind === "integer" ? <Input {...controlProps} type="number" value={typeof value === "number" ? value : ""} required={required}
            step={field.kind === "integer" ? 1 : "any"} min={typeof shape?.minimum === "number" ? shape.minimum : undefined}
            max={typeof shape?.maximum === "number" ? shape.maximum : undefined}
            onChange={event => onChange(event.currentTarget.value === "" || !Number.isFinite(event.currentTarget.valueAsNumber) ? undefined : event.currentTarget.valueAsNumber)} />
            : field.kind === "enum" ? <Select value={value === undefined ? "" : JSON.stringify(value)} required={required}
              onValueChange={next => onChange(JSON.parse(next))}>
              <SelectTrigger {...controlProps} className="w-full"><SelectValue placeholder={i18n.formatMessage(configurationFieldMessages.selectValue)} /></SelectTrigger>
              <SelectContent><SelectGroup>{field.options.map(option => {
                return <SelectItem key={JSON.stringify(option)} value={JSON.stringify(option)}>
                  {String(option)}
                </SelectItem>;
              })}</SelectGroup></SelectContent>
            </Select> : null}
      {!required && value !== undefined && <Button type="button" variant="ghost" size="xs" onClick={() => onChange(undefined)}>{i18n.formatMessage(configurationFieldMessages.leaveUnset)}</Button>}
    </div>
  </Field>;
}

