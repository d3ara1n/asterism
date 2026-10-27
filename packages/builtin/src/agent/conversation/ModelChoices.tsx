import { Brain, Cpu } from "lucide-react";
import { availableThinkingLevels, modelReference, type ThinkingLevel } from "@asterism/sdk/contracts";
import { resolveAgentModel, resolveCatalogModel, type ModelConfigurationSnapshot } from "@asterism/builtin-api/contracts";
import { commonMessages } from "@asterism/ui/messages/common";
import { modelSelectionMessages, thinkingLabels } from "@asterism/ui/messages/model-selection";
import { ConfigurationChoice } from "@asterism/ui/ConfigurationChoice";
import { useI18n } from "@asterism/sdk/renderer";

const FOLLOW = "__agent_default";

/** Selection saves overrides only; the effective model is used to display capabilities, without filling in defaults or intercepting submission. */
export function ModelChoices({ configuration, agent, model, thinking, disabled, onModelChange, onThinkingChange }: {
  configuration: ModelConfigurationSnapshot | null | undefined;
  agent: string | null; model: string | null; thinking: ThinkingLevel | null; disabled?: boolean;
  onModelChange(value: string | null): void; onThinkingChange(value: ThinkingLevel | null): void;
}) {
  const i18n = useI18n();
  const models = configuration?.models.filter(item => resolveCatalogModel(configuration, modelReference(item))) ?? [];
  const selectedModel = configuration ? resolveCatalogModel(configuration, model) : null;
  const effectiveModel = configuration ? resolveAgentModel(configuration, { agent, model }) : null;
  const levels = availableThinkingLevels(effectiveModel);
  const follow = i18n.text(modelSelectionMessages.agentDefault);
  const unsupported = effectiveModel?.capabilities.reasoning === false;
  const thinkingLabel = thinking === null ? follow : i18n.text(thinkingLabels[thinking]);
  return <>
    <ConfigurationChoice icon={<Cpu />} label={i18n.text(commonMessages.model)} disabled={disabled || !configuration}
      value={model === null ? follow : selectedModel?.name ?? i18n.formatMessage(modelSelectionMessages.unavailable, { value: model })}
      selected={model ?? FOLLOW} onSelect={value => onModelChange(value === FOLLOW ? null : value)}
      options={[{ value: FOLLOW, label: follow }, ...models.map(item => ({ value: modelReference(item),
        label: `${configuration?.modelProviders.find(provider => provider.id === item.providerId)?.name ?? ""} / ${item.name}` }))]} />
    <ConfigurationChoice icon={<Brain />} label={i18n.text(commonMessages.thinkingTitle)} disabled={disabled || !configuration || unsupported}
      value={unsupported ? i18n.text(modelSelectionMessages.thinkingUnsupported) : thinkingLabel}
      selected={thinking ?? FOLLOW} onSelect={value => onThinkingChange(value === FOLLOW ? null : value as ThinkingLevel)}
      options={[{ value: FOLLOW, label: follow }, ...levels.map(level => ({ value: level, label: i18n.text(thinkingLabels[level]) }))]} />
  </>;
}
