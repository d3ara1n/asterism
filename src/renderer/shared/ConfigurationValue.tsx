import { Fragment, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { jsonSchema, type UiText, type Json, type ConfigurationPresentation } from "@atelier/sdk/contracts";
import { pointerChild } from "../../shared/configuration-presentation";
import { configurationField, configurationLabel, configurationProperty, objectValue } from "../../shared/configuration-fields";
import { pluginConfigurationMessages } from "../messages/plugin-configuration";
import { useI18n } from "./i18n";
import { Field, FieldLabel, FieldDescription, FieldError, FieldSet, FieldLegend, FieldGroup, FieldContent } from "@atelier/ui/ui/field";
import { Textarea } from "@atelier/ui/ui/textarea";
import { Button } from "@atelier/ui/ui/button";
import { Switch } from "@atelier/ui/ui/switch";
import { Input } from "@atelier/ui/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "@atelier/ui/ui/select";
import { Separator } from "@atelier/ui/ui/separator";
import { cn } from "@atelier/ui/utils";

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

export function ConfigurationValue({ schema, value, onChange, label, required = true, depth = 0, presentation, path = "", actions, layout = "form" }: {
  schema: Json | null; value: Json | undefined; onChange(value: Json | undefined): void;
  label: string; required?: boolean; depth?: number; presentation?: ConfigurationPresentation; path?: string; actions?: ReactNode;
  layout?: "form" | "settings";
}) {
  const id = useId();
  const i18n = useI18n(), display = presentation?.fields[path];
  const shape = objectValue(schema);
  const description = display?.description !== undefined ? i18n.text(display.description) : typeof shape?.description === "string" ? shape.description : undefined;
  const field = depth < 6 ? configurationField(schema) : { kind: "json" as const };
  const title = display?.title !== undefined ? i18n.text(display.title) : configurationLabel(schema, label);
  const settings = layout === "settings";
  const object = objectValue(value);
  if (field.kind === "object" && required && object) {
    // 设置按对象层级分组；连续普通字段共用底板，嵌套对象拥有自己的标题与底板。
    const groups: { key: string; nested: boolean; children: ReactElement[] }[] = [];
    for (const [name, child] of Object.entries(field.properties)) {
      const childValue = object[name];
      const childRequired = field.required.includes(name);
      const nested = settings && depth + 1 < 6 && childRequired
        && configurationField(child).kind === "object" && !!objectValue(childValue);
      const node = <ConfigurationValue key={name} schema={child} value={childValue} label={name}
        required={childRequired} depth={depth + 1} presentation={presentation} path={pointerChild(path, name)} layout={layout}
        onChange={next => onChange(configurationProperty(value, name, next))} />;
      const previous = groups.at(-1);
      if (!nested && previous && !previous.nested) previous.children.push(node);
      else groups.push({ key: name, nested, children: [node] });
    }
    return <FieldSet className={settings ? "min-w-0 gap-3" : undefined}>
      <FieldLegend variant="label" className={cn(actions && "flex w-full items-center justify-between gap-2",
        settings && depth === 0 && !actions && "sr-only")}>
        {title}{actions}
      </FieldLegend>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldGroup className={settings ? "gap-5" : undefined}>{groups.map(group => group.nested || !settings
        ? <Fragment key={group.key}>{group.children}</Fragment>
        : <div key={group.key} className="min-w-0"><FieldGroup className="surface gap-0">
          {group.children.map((node, index) => <Fragment key={node.key}>
            {index > 0 && <Separator />}
            <div className="min-w-0 p-4">{node}</div>
          </Fragment>)}
        </FieldGroup></div>)}</FieldGroup>
    </FieldSet>;
  }
  if (field.kind === "json" || field.kind === "object") return <JsonInput id={id} title={title} description={description}
    value={value} onChange={onChange} required={required} actions={actions} />;
  const boolean = field.kind === "boolean";
  const controlProps = { id, "aria-describedby": description ? `${id}-description` : undefined };
  return <Field orientation={boolean ? "horizontal" : settings ? "responsive" : "vertical"}>
    <FieldContent className="min-w-0">
      {actions ? <div className="flex items-center justify-between gap-2"><FieldLabel htmlFor={id}>{title}</FieldLabel>{actions}</div>
        : <FieldLabel htmlFor={id}>{title}</FieldLabel>}
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      {value === undefined && !required && <FieldDescription>{i18n.formatMessage(pluginConfigurationMessages.notSetOption)}</FieldDescription>}
    </FieldContent>
    <div className={cn("flex min-w-0 items-center gap-2", settings && !boolean && "@md/field-group:w-56 @md/field-group:shrink-0")}>
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
              <SelectTrigger {...controlProps} className="w-full"><SelectValue placeholder={i18n.formatMessage(pluginConfigurationMessages.selectValue)} /></SelectTrigger>
              <SelectContent><SelectGroup>{field.options.map(option => {
                const translated = display?.enumLabels?.find(entry => entry.value === option);
                return <SelectItem key={JSON.stringify(option)} value={JSON.stringify(option)}>
                  {translated ? i18n.text(translated.label) : String(option)}
                </SelectItem>;
              })}</SelectGroup></SelectContent>
            </Select> : null}
      {!required && value !== undefined && <Button type="button" variant="ghost" size="xs" onClick={() => onChange(undefined)}>{i18n.formatMessage(pluginConfigurationMessages.leaveUnsetOption)}</Button>}
    </div>
  </Field>;
}

