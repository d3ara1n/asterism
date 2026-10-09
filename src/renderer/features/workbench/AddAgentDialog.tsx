import { useState } from "react";
import { Bot, Brain, Cpu } from "lucide-react";
import { resolveProviderModel, thinkingSchema, type ConfigurationSnapshot, type ThinkingLevel } from "../../../shared/configuration";
import { initialAgentSelection } from "../configuration/agent-selection";
import type { AgentSelection } from "../../../shared/model";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../shared/ui/dialog";
import { Button } from "../../shared/ui/button";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Spinner } from "../../shared/ui/spinner";
import { ConfigurationChoice as Choice } from "../configuration/ConfigurationChoice";
import { s } from "../configuration/state";
import { t } from "../../shared/i18n";

/**
 * 添加代理必须经用户确认 agent、模型与思考等级；agent 的模型角色只作为预填参考，
 * 角色不可用时模型留空，要求明确选择。
 */
export function AddAgentDialog({ configuration, busy, error, onCreate, onClose }: {
  configuration: ConfigurationSnapshot | null; busy: boolean; error?: string | null;
  onCreate: (selection: AgentSelection) => Promise<boolean>; onClose: () => void;
}) {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ThinkingLevel | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const agents = configuration?.agents.filter(item => item.enabled) ?? [];
  const agent = agents.find(item => item.id === agentId);
  const models = configuration?.models.filter(item => resolveProviderModel(configuration, item.id)) ?? [];
  const model = configuration ? resolveProviderModel(configuration, modelId)?.model : null;
  const selectAgent = (id: string) => {
    if (!configuration) return;
    const resolved = initialAgentSelection(configuration, id);
    setAgentId(resolved.agentId); setModelId(resolved.modelId); setThinking(resolved.thinking);
    setSelectionError(resolved.error ? s("This agent’s default model configuration is unavailable. Select a model or update settings.", "此代理的默认模型配置不可用，请选择模型或修改设置。") : null);
  };
  const canCreate = !busy && !!agent && !!model;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{s("Add agent", "添加代理")}</DialogTitle>
        <DialogDescription>{s("Choose the agent configuration, model, and thinking level for the new agent.", "为新代理选择 agent 配置、模型与思考等级。")}</DialogDescription>
      </DialogHeader>
      {(error || selectionError) && <Alert variant="destructive"><AlertDescription>{error ?? selectionError}</AlertDescription></Alert>}
      <form className="flex flex-col gap-5" onSubmit={event => {
        event.preventDefault();
        if (!canCreate) return;
        void onCreate({ agentConfigurationId: agent!.id, modelId: model!.id, thinking: model!.capabilities.reasoning ? thinking : "off" })
          .then(saved => { if (saved) onClose(); });
      }}>
        <div className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-md border bg-muted px-1.5 py-1">
          <Choice icon={<Bot />} label={t.agent} value={agent?.name ?? s("Choose agent", "选择代理")} disabled={!configuration || busy}
            selected={agent?.id ?? ""} onSelect={selectAgent} options={agents.map(item => ({ value: item.id, label: item.name }))} />
          <Choice icon={<Cpu />} label={t.model} disabled={!configuration || !models.length || busy}
            value={model?.name ?? (models.length ? s("Choose model", "选择模型") : s("Add a model in settings", "先在设置中添加模型"))}
            selected={model?.id ?? ""} onSelect={id => { setModelId(id); setSelectionError(null); }}
            options={models.map(item => ({ value: item.id, label: `${configuration?.providers.find(p => p.id === item.providerId)?.name ?? ""} / ${item.name}` }))} />
          <Choice icon={<Brain />} label={s("Thinking level", "思考等级")} disabled={!model?.capabilities.reasoning || busy}
            value={!model?.capabilities.reasoning ? s("Off", "关闭") : thinking ?? s("Default", "默认")}
            selected={model?.capabilities.reasoning ? thinking ?? "__default" : "off"}
            onSelect={value => setThinking(value === "__default" ? null : value as ThinkingLevel)}
            options={[{ value: "__default", label: s("Default", "默认") }, ...thinkingSchema.options.map(level => ({ value: level, label: level }))]} />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
          <Button disabled={!canCreate} aria-busy={busy}>{busy && <Spinner aria-hidden="true" />}{busy ? t.creating : t.create}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
