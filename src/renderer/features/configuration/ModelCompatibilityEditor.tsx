import { z } from "zod";
import { Plus, X } from "lucide-react";
import { jsonSchema } from "@atelier/sdk/contracts";
import { mergeModelCompatibility, modelCompatibilityDefinition, modelCompatibilityDefinitions, type ModelCompatibility, type ModelCompatibilityDefinition } from "../../../shared/model-compatibility";
import { providersMessages } from "../../messages/providers";
import { ConfigurationValue } from "../../shared/ConfigurationValue";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Card } from "../../shared/ui/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../shared/ui/dropdown-menu";
import { EditorSection } from "./forms";
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

/** 只修改当前层的显式列表；提供商条目只读，模型可复制参数条目并整项覆盖。区块可折叠，已有条目时默认展开。 */
export function ModelCompatibilityEditor({ value, inherited, onChange }: {
  value: ModelCompatibility[]; inherited?: ModelCompatibility[]; onChange(value: ModelCompatibility[]): void;
}) {
  const i18n = useI18n();
  const entries = mergeModelCompatibility(inherited ?? [], value);
  const available = modelCompatibilityDefinitions.filter(definition => !entries.some(entry => entry.id === definition.id));
  return <EditorSection collapsible defaultOpen={entries.length > 0} title={i18n.formatMessage(providersMessages.compatibility)}
    hint={i18n.formatMessage(inherited === undefined ? providersMessages.providerCompatibilityHint : providersMessages.modelCompatibilityHint)}>
    {entries.map(entry => {
      const definition = modelCompatibilityDefinition(entry.id)!;
      const metadata = definition.schema.meta();
      const title = metadata?.title ?? definition.id;
      const fromProvider = inherited?.some(item => item.id === entry.id);
      const readOnly = !value.some(item => item.id === entry.id);
      const remove = readOnly ? undefined : <Button type="button" variant="ghost" size="icon-xs"
        aria-label={i18n.formatMessage(fromProvider ? providersMessages.restoreProviderCompatibility : providersMessages.removeCompatibility, { name: title })}
        onClick={() => onChange(value.filter(item => item.id !== entry.id))}><X /></Button>;
      return <Card key={entry.id} className="gap-3 p-4">
        {fromProvider && <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary">{i18n.formatMessage(readOnly ? providersMessages.compatibilityFromProvider : providersMessages.compatibilityOverridden)}</Badge>
          {readOnly && definition.kind === "options" && <Button type="button" variant="ghost" size="xs"
            onClick={() => onChange([...value, structuredClone(entry)])}>{i18n.formatMessage(providersMessages.overrideCompatibility)}</Button>}
        </div>}
        {definition.kind === "tag" ? <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2"><span className="type-label break-words">{title}</span><Applicability definition={definition} /></div>{remove}
        </div> : <>
          <Applicability definition={definition} />
          <fieldset disabled={readOnly} className="min-w-0">
            <ConfigurationValue schema={forms.get(entry.id)!} value={"value" in entry ? entry.value : undefined} label={title} actions={remove}
              onChange={next => {
                if (!readOnly) onChange(value.map(item => item.id === entry.id ? { id: entry.id, ...(next === undefined ? {} : { value: next }) } : item));
              }} />
          </fieldset>
        </>}
      </Card>;
    })}
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" className="w-fit" disabled={!available.length}>
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
  </EditorSection>;
}
