import { useI18n, useRendererCatalogs } from "@atelier/sdk/renderer";
import { Bot, Cpu, Brain } from "lucide-react";

import { ConfigurationChoice } from "../../../renderer/shared/ConfigurationChoice";
import { resolveModelRole, resolveProviderModel, thinkingSchema, type ThinkingLevel, modelReference } from "../../../shared/configuration";
import type { AgentSelection } from "../../../shared/model";
import { commonMessages } from "../../messages/common";
import { configurationMessages } from "../../messages/configuration";
import { ModelConfiguration } from "../configuration";

const thinkingLabels = { off: configurationMessages.thinkingOff, minimal: configurationMessages.thinkingMinimal, low: configurationMessages.thinkingLow, medium: configurationMessages.thinkingMedium, high: configurationMessages.thinkingHigh, xhigh: configurationMessages.thinkingXhigh };

export function AgentConfigurationPicker({ selection, disabled, running, onChange, onError }: {
  selection: AgentSelection; disabled: boolean; running: boolean;
  onChange(selection: AgentSelection): Promise<void>; onError(message: import("@atelier/sdk/contracts").UiText): void;
}) {
  const i18n = useI18n();
  const configuration = useRendererCatalogs().get(ModelConfiguration);
  const selectedAgent = configuration?.agents.find(a => a.id === selection?.agent && a.enabled);
  const selectedModel = configuration ? resolveProviderModel(configuration, selection?.model ?? null)?.model : null;
  const models = configuration?.models.filter(model => resolveProviderModel(configuration, modelReference(model))) ?? [];
  return <div className="flex min-w-0 flex-wrap items-center gap-0.5">
  <ConfigurationChoice icon={<Bot />} label={i18n.formatMessage(commonMessages.agent)} value={selectedAgent?.name ?? i18n.formatMessage(configurationMessages.unavailableAgent)}
    selected={selection.agent} disabled={disabled || !configuration}
    options={configuration?.agents.filter(a => a.enabled).map(a => ({ value: a.id, label: a.name })) ?? []}
    onSelect={id => {
      if (!configuration) return;
      const next = configuration.agents.find(item => item.id === id)!;
      const defaults = resolveModelRole(configuration, next.modelRole ?? "default", { model: selection.model, thinking: selection.thinking });
      if (defaults.error || !defaults.model) { onError(configurationMessages.agentModelUnavailable); return; }
      void onChange({ agent: id, model: defaults.model, thinking: defaults.thinking });
    }} />
  <ConfigurationChoice icon={<Cpu />} label={i18n.formatMessage(commonMessages.model)} value={selectedModel?.name ?? i18n.formatMessage(configurationMessages.unavailableModel)}
    selected={selection.model} disabled={disabled || !models.length}
    options={models.map(model => ({ value: modelReference(model), label: `${configuration?.providers.find(p => p.id === model.providerId)?.name ?? ""} / ${model.name}` }))}
    onSelect={id => { void onChange({ ...selection, model: id }); }} />
  <ConfigurationChoice icon={<Brain />} label={i18n.formatMessage(configurationMessages.thinkingLevel)} value={selectedModel?.capabilities.reasoning ? selection.thinking ? i18n.text(thinkingLabels[selection.thinking]) : i18n.formatMessage(configurationMessages.defaultModel) : i18n.formatMessage(configurationMessages.thinkingOffOption)}
    selected={selectedModel?.capabilities.reasoning ? selection.thinking ?? "__default" : "off"} disabled={disabled || !selectedModel?.capabilities.reasoning}
    options={[{ value: "__default", label: i18n.formatMessage(configurationMessages.defaultThinking) }, ...thinkingSchema.options.map(level => ({ value: level, label: i18n.text(thinkingLabels[level]) }))]}
    onSelect={value => { void onChange({ ...selection, thinking: value === "__default" ? null : value as ThinkingLevel }); }} />
  {running && <span className="type-caption">{i18n.formatMessage(configurationMessages.nextRequestHint)}</span>}
</div>;
}
