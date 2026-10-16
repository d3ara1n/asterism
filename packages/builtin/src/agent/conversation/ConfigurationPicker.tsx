import { useI18n, useRendererCatalogs } from "@atelier/sdk/renderer";
import { Bot } from "lucide-react";

import { ConfigurationChoice } from "@atelier/ui/ConfigurationChoice";
import { ModelChoices } from "./ModelChoices";
import { type AgentSelection, ModelConfiguration } from "@atelier/builtin-api/contracts";
import { commonMessages } from "../../messages/common";
import { configurationMessages } from "../../messages/configuration";

export function AgentConfigurationPicker({ selection, disabled, onChange }: {
  selection: AgentSelection; disabled: boolean;
  onChange(selection: AgentSelection): Promise<void>;
}) {
  const i18n = useI18n();
  const configuration = useRendererCatalogs().get(ModelConfiguration);
  const selectedAgent = configuration?.agents.find(a => a.id === selection?.agent && a.enabled);
  return <>
  <ConfigurationChoice icon={<Bot />} label={i18n.formatMessage(commonMessages.agent)} value={selectedAgent?.name ?? i18n.formatMessage(configurationMessages.unavailableAgent)}
    selected={selection.agent} disabled={disabled || !configuration}
    options={configuration?.agents.filter(a => a.enabled).map(a => ({ value: a.id, label: a.name })) ?? []}
    onSelect={id => { void onChange({ ...selection, agent: id }); }} />
  <ModelChoices configuration={configuration} {...selection} disabled={disabled}
    onModelChange={model => { void onChange({ ...selection, model }); }}
    onThinkingChange={thinking => { void onChange({ ...selection, thinking }); }} />
</>;
}
