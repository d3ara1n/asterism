import { CreationForm } from "../shared/creation-form";
import { Field, FieldLabel, FieldTitle } from "@asterism/ui/ui/field";

import { Input } from "@asterism/ui/ui/input";

import { Alert, AlertDescription } from "@asterism/ui/ui/alert";

import { ConfigurationChoice as Choice } from "@asterism/ui/ConfigurationChoice";
import { Bot } from "lucide-react";

import { commonMessages } from "../messages/common";
import { creationMessages } from "../messages/creation";
import { useI18n, useRendererCatalogs, type CreationInputProps } from "@asterism/sdk/renderer";
import { useState } from "react";

import type { ThinkingLevel } from "@asterism/sdk/contracts";
import { type AgentSelection, ModelConfiguration } from "@asterism/builtin-api/contracts";
import { ModelChoices } from "./conversation/ModelChoices";


/**
 * 模型与等级留空时沿用代理角色，每次请求重新解析。名称可选，留空时由创建入口随机生成。
 */
export function AgentInput({ busy, resolve, cancel }: CreationInputProps<{ selection: AgentSelection; title?: string }>) {
  const i18n = useI18n();
  const catalogs = useRendererCatalogs();
  const configuration = catalogs.get(ModelConfiguration);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ThinkingLevel | null>(null);
  const [title, setTitle] = useState("");
  const agents = configuration?.agents.filter(item => item.enabled) ?? [];
  const agent = agents.find(item => item.id === agentId);
  const error = catalogs.error;
  return <CreationForm busy={busy} onCancel={cancel} disabled={!agent}
    onSubmit={() => resolve({
      selection: { agent: agent!.id, model: modelId, thinking },
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
        <Choice icon={<Bot />} label={i18n.formatMessage(commonMessages.agent)} value={agent?.id ?? i18n.formatMessage(creationMessages.chooseAgent)} disabled={!configuration || busy}
          selected={agent?.id ?? ""} onSelect={setAgentId} options={agents.map(item => ({ value: item.id, label: item.id }))} />
        <ModelChoices configuration={configuration} agent={agentId} model={modelId} thinking={thinking} disabled={busy}
          onModelChange={setModelId} onThinkingChange={setThinking} />
      </div>
    </Field>
  </CreationForm>;
}
