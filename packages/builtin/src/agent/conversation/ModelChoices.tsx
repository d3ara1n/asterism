import { Brain, Cpu } from "lucide-react";
import { availableThinkingLevels, modelReference, type ThinkingLevel } from "@atelier/sdk/contracts";
import { resolveAgentModel, resolveCatalogModel, type ModelConfigurationSnapshot } from "@atelier/builtin-api/contracts";
import { commonMessages } from "@atelier/ui/messages/common";
import { modelSelectionMessages, thinkingLabels } from "@atelier/ui/messages/model-selection";
import { ConfigurationChoice } from "@atelier/ui/ConfigurationChoice";
import { useI18n } from "@atelier/sdk/renderer";

const FOLLOW = "__agent_default";

/** 选择只保存覆盖；生效模型用于展示能力，不回填默认值或拦截提交。 */
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
        label: `${configuration?.providers.find(provider => provider.id === item.providerId)?.name ?? ""} / ${item.name}` }))]} />
    <ConfigurationChoice icon={<Brain />} label={i18n.text(commonMessages.thinkingTitle)} disabled={disabled || !configuration || unsupported}
      value={unsupported ? i18n.text(modelSelectionMessages.thinkingUnsupported)
        : thinking !== null && !levels.includes(thinking) ? i18n.formatMessage(modelSelectionMessages.unavailable, { value: thinkingLabel }) : thinkingLabel}
      selected={thinking ?? FOLLOW} onSelect={value => onThinkingChange(value === FOLLOW ? null : value as ThinkingLevel)}
      options={[{ value: FOLLOW, label: follow }, ...levels.map(level => ({ value: level, label: i18n.text(thinkingLabels[level]) }))]} />
  </>;
}
