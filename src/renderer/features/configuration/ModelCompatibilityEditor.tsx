import { z } from "zod";
import { Plus, X } from "lucide-react";
import { jsonSchema } from "@atelier/sdk/contracts";
import { modelCompatibilityDefinition, modelCompatibilityDefinitions, type ModelCompatibility, type ModelCompatibilityDefinition } from "../../../shared/model-compatibility";
import { providersMessages } from "../../messages/providers";
import { ConfigurationValue } from "../../shared/ConfigurationValue";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../shared/ui/dropdown-menu";
import { modelProtocolLabels } from "./protocols";

const forms = new Map(modelCompatibilityDefinitions.filter(definition => definition.kind === "options")
  .map(definition => [definition.id, jsonSchema.parse(z.toJSONSchema(definition.schema, { io: "input" }))]));

function Applicability({ definition }: { definition: ModelCompatibilityDefinition }) {
  return <span className="flex flex-col gap-1">
    <span className="flex flex-wrap gap-1">{definition.appliesTo.protocols.map(protocol =>
      <Badge key={protocol} variant="secondary">{modelProtocolLabels[protocol]}</Badge>)}</span>
    {definition.appliesTo.endpoints?.map(endpoint => <span key={endpoint} className="type-caption break-all">{endpoint}</span>)}
  </span>;
}

/** 只编辑模型的显式列表；协议标记用于说明，不过滤添加菜单。 */
export function ModelCompatibilityEditor({ value, onChange }: {
  value: ModelCompatibility[]; onChange(value: ModelCompatibility[]): void;
}) {
  const i18n = useI18n();
  const available = modelCompatibilityDefinitions.filter(definition => !value.some(entry => entry.id === definition.id));
  return <div className="mt-5 space-y-5">
    {value.map(entry => {
      const definition = modelCompatibilityDefinition(entry.id)!;
      const metadata = definition.schema.meta();
      const title = metadata?.title ?? definition.id;
      const remove = <Button type="button" variant="ghost" size="icon-xs"
        aria-label={i18n.formatMessage(providersMessages.removeCompatibility, { name: title })}
        onClick={() => onChange(value.filter(item => item.id !== entry.id))}><X /></Button>;
      return <div key={entry.id} className="space-y-3">
        {definition.kind === "tag" ? <div className="flex items-center justify-between gap-2">
          <div className="space-y-2"><span className="type-label">{title}</span><Applicability definition={definition} /></div>{remove}
        </div> : <>
          <Applicability definition={definition} />
          <ConfigurationValue schema={forms.get(entry.id)!} value={"value" in entry ? entry.value : undefined} label={title} actions={remove}
            onChange={next => onChange(value.map(item => item.id === entry.id ? { id: entry.id, ...(next === undefined ? {} : { value: next }) } : item))} />
        </>}
      </div>;
    })}
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className="-ml-2" disabled={!available.length}>
        <Plus />{i18n.formatMessage(providersMessages.addCompatibility)}
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {available.map(definition => {
          const metadata = definition.schema.meta();
          return <DropdownMenuItem key={definition.id} className="flex-col items-start gap-1"
            onSelect={() => onChange([...value, definition.kind === "tag" ? { id: definition.id }
              : { id: definition.id, value: structuredClone(definition.initialValue) }])}>
            <span>{metadata?.title ?? definition.id}</span>
            <Applicability definition={definition} />
            {metadata?.description && <span className="type-caption max-w-sm whitespace-normal">{metadata.description}</span>}
          </DropdownMenuItem>;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
