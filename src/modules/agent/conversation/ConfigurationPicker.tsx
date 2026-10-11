import { Bot, Brain, Cpu } from "lucide-react";
import type { AgentSelection } from "../../../shared/model";
import { resolveModelRole, resolveProviderModel, thinkingSchema, type ThinkingLevel, modelReference } from "../../../shared/configuration";
import { useRendererCatalogs } from "@atelier/sdk/renderer";
import { ModelConfiguration } from "../configuration";
import { ConfigurationChoice } from "../../../renderer/shared/ConfigurationChoice";
import { t, s } from "../../../renderer/shared/i18n";

export function AgentConfigurationPicker({ selection, disabled, running, onChange, onError }: {
  selection: AgentSelection; disabled: boolean; running: boolean;
  onChange(selection: AgentSelection): Promise<void>; onError(message: string): void;
}) {
  const configuration = useRendererCatalogs().get(ModelConfiguration);
  const selectedAgent = configuration?.agents.find(a => a.id === selection?.agent && a.enabled);
  const selectedModel = configuration ? resolveProviderModel(configuration, selection?.model ?? null)?.model : null;
  const models = configuration?.models.filter(model => resolveProviderModel(configuration, modelReference(model))) ?? [];
  return <div className="flex min-w-0 flex-wrap items-center gap-0.5">
  <ConfigurationChoice icon={<Bot />} label={t.agent} value={selectedAgent?.name ?? s("Unavailable agent", "代理不可用")}
    selected={selection.agent} disabled={disabled || !configuration}
    options={configuration?.agents.filter(a => a.enabled).map(a => ({ value: a.id, label: a.name })) ?? []}
    onSelect={id => {
      if (!configuration) return;
      const next = configuration.agents.find(item => item.id === id)!;
      const defaults = resolveModelRole(configuration, next.modelRole ?? "default", { model: selection.model, thinking: selection.thinking });
      if (defaults.error || !defaults.model) { onError(s("This agent's default model is unavailable. Select an available model or update settings.", "此代理的默认模型不可用，请先选择可用模型或修改设置。")); return; }
      void onChange({ agent: id, model: defaults.model, thinking: defaults.thinking });
    }} />
  <ConfigurationChoice icon={<Cpu />} label={t.model} value={selectedModel?.name ?? s("Unavailable model", "模型不可用")}
    selected={selection.model} disabled={disabled || !models.length}
    options={models.map(model => ({ value: modelReference(model), label: `${configuration?.providers.find(p => p.id === model.providerId)?.name ?? ""} / ${model.name}` }))}
    onSelect={id => { void onChange({ ...selection, model: id }); }} />
  <ConfigurationChoice icon={<Brain />} label={s("Thinking level", "思考等级")} value={selectedModel?.capabilities.reasoning ? selection.thinking ?? s("Default", "默认") : s("Off", "关闭")}
    selected={selectedModel?.capabilities.reasoning ? selection.thinking ?? "__default" : "off"} disabled={disabled || !selectedModel?.capabilities.reasoning}
    options={[{ value: "__default", label: s("Default", "默认") }, ...thinkingSchema.options.map(level => ({ value: level, label: level }))]}
    onSelect={value => { void onChange({ ...selection, thinking: value === "__default" ? null : value as ThinkingLevel }); }} />
  {running && <span className="type-caption">{s("Changes apply to the next request", "修改于下一次请求生效")}</span>}
</div>;
}
