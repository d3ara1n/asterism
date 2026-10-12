import { CreationForm } from "../../renderer/shared/creation-form";
import { Field, FieldLabel, FieldTitle } from "../../renderer/shared/ui/field";

import { Input } from "../../renderer/shared/ui/input";

import { Alert, AlertDescription } from "../../renderer/shared/ui/alert";

import { ConfigurationChoice as Choice } from "../../renderer/shared/ConfigurationChoice";
import { Bot, Cpu, Brain } from "lucide-react";

import { commonMessages } from "../messages/common";
import { creationMessages } from "../messages/creation";
import { useI18n, useRendererCatalogs, type CreationInputProps } from "@atelier/sdk/renderer";
import { useState } from "react";

import { resolveProviderModel, thinkingSchema, type ThinkingLevel, modelReference } from "../../shared/configuration";
import type { AgentSelection } from "../../shared/model";
import { initialAgentSelection } from "../../renderer/features/configuration/agent-selection";

import { ModelConfiguration } from "./configuration";

/**
 * 添加代理必须经用户确认 agent、模型与思考等级；agent 的模型角色只作为预填参考，
 * 角色不可用时模型留空，要求明确选择。名称可选，留空时用 agent 配置名。
 */
export function AgentInput({ busy, resolve, cancel }: CreationInputProps<{ selection: AgentSelection; title?: string }>) {
  const i18n = useI18n();
  const catalogs = useRendererCatalogs();
  const configuration = catalogs.get(ModelConfiguration);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ThinkingLevel | null>(null);
  const [title, setTitle] = useState("");
  const [selectionError, setSelectionError] = useState<import("@atelier/sdk/contracts").UiText | null>(null);
  const agents = configuration?.agents.filter(item => item.enabled) ?? [];
  const agent = agents.find(item => item.id === agentId);
  const models = configuration?.models.filter(item => resolveProviderModel(configuration, modelReference(item))) ?? [];
  const model = configuration ? resolveProviderModel(configuration, modelId)?.model : null;
  const selectAgent = (id: string) => {
    if (!configuration) return;
    const resolved = initialAgentSelection(configuration, id);
    setAgentId(resolved.agentId); setModelId(resolved.modelId); setThinking(resolved.thinking);
    setSelectionError(resolved.error ? creationMessages.agentModelUnavailable : null);
  };
  const error = catalogs.error ?? selectionError;
  return <CreationForm busy={busy} onCancel={cancel} disabled={!agent || !model}
    onSubmit={() => resolve({
      selection: { agent: agent!.id, model: modelReference(model!), thinking: model!.capabilities.reasoning ? thinking : "off" },
      ...(title.trim() ? { title: title.trim() } : {}),
    })}>
    <Field>
      <FieldLabel htmlFor="agent-title">{i18n.formatMessage(commonMessages.name)}</FieldLabel>
      <Input id="agent-title" autoFocus maxLength={160} value={title} onChange={e => setTitle(e.target.value)} />
    </Field>
    <Field aria-labelledby="agent-configuration-label">
      <FieldTitle id="agent-configuration-label">{i18n.formatMessage(commonMessages.agent)}</FieldTitle>
      {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
      <div className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-md border bg-muted px-1.5 py-1">
        <Choice icon={<Bot />} label={i18n.formatMessage(commonMessages.agent)} value={agent?.name ?? i18n.formatMessage(creationMessages.chooseAgent)} disabled={!configuration || busy}
          selected={agent?.id ?? ""} onSelect={selectAgent} options={agents.map(item => ({ value: item.id, label: item.name }))} />
        <Choice icon={<Cpu />} label={i18n.formatMessage(commonMessages.model)} disabled={!configuration || !models.length || busy}
          value={model?.name ?? (models.length ? i18n.formatMessage(creationMessages.chooseModel) : i18n.formatMessage(creationMessages.addModel))}
          selected={(model ? modelReference(model) : "")} onSelect={id => { setModelId(id); setSelectionError(null); }}
          options={models.map(item => ({ value: modelReference(item), label: `${configuration?.providers.find(p => p.id === item.providerId)?.name ?? ""} / ${item.name}` }))} />
        <Choice icon={<Brain />} label={i18n.formatMessage(creationMessages.thinkingLevel)} disabled={!model?.capabilities.reasoning || busy}
          value={!model?.capabilities.reasoning ? i18n.formatMessage(creationMessages.thinkingOff) : thinking ?? i18n.formatMessage(creationMessages.defaultThinking)}
          selected={model?.capabilities.reasoning ? thinking ?? "__default" : "off"}
          onSelect={value => setThinking(value === "__default" ? null : value as ThinkingLevel)}
          options={[{ value: "__default", label: i18n.formatMessage(creationMessages.defaultModel) }, ...thinkingSchema.options.map(level => ({ value: level, label: level }))]} />
      </div>
    </Field>
  </CreationForm>;
}
