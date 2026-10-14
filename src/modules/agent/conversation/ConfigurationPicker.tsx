import { useI18n, useRendererCatalogs } from "@atelier/sdk/renderer";
import { Bot } from "lucide-react";

import { ConfigurationChoice } from "../../../renderer/shared/ConfigurationChoice";
import { ModelChoices } from "../../../renderer/shared/ModelChoices";
import type { AgentSelection } from "../../../shared/model";
import { commonMessages } from "../../messages/common";
import { configurationMessages } from "../../messages/configuration";
import { ModelConfiguration } from "../configuration";

export function AgentConfigurationPicker({ selection, disabled, running, onChange }: {
  selection: AgentSelection; disabled: boolean; running: boolean;
  onChange(selection: AgentSelection): Promise<void>;
}) {
  const i18n = useI18n();
  const configuration = useRendererCatalogs().get(ModelConfiguration);
  const selectedAgent = configuration?.agents.find(a => a.id === selection?.agent && a.enabled);
  return <div className="flex min-w-0 flex-wrap items-center gap-0.5">
  <ConfigurationChoice icon={<Bot />} label={i18n.formatMessage(commonMessages.agent)} value={selectedAgent?.name ?? i18n.formatMessage(configurationMessages.unavailableAgent)}
    selected={selection.agent} disabled={disabled || !configuration}
    options={configuration?.agents.filter(a => a.enabled).map(a => ({ value: a.id, label: a.name })) ?? []}
    onSelect={id => { void onChange({ ...selection, agent: id }); }} />
  <ModelChoices configuration={configuration} {...selection} disabled={disabled}
    onModelChange={model => { void onChange({ ...selection, model }); }}
    onThinkingChange={thinking => { void onChange({ ...selection, thinking }); }} />
  {running && <span className="type-caption">{i18n.formatMessage(configurationMessages.nextRequestHint)}</span>}
</div>;
}
