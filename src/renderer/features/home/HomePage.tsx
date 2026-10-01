import { useEffect, useRef, useState } from "react";
import { ArrowUp, Settings } from "lucide-react";
import { resolveModelRole, resolveProviderModel, thinkingSchema, type ConfigurationSnapshot, type ThinkingLevel } from "../../../shared/configuration";
import { t } from "../../shared/i18n";
import { Button, IconButton } from "../../shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { Textarea } from "../../shared/ui/textarea";
import { WeftMark } from "../../shared/ui/weft-mark";
import { s, useConfiguration } from "../configuration/state";

/** 应用级草稿入口；取用配置填入选择，但不订阅角色变化去刷新已选 agent 的默认值。 */
export function HomePage({ active, draft, onDraftChange, onSettings }: {
  active: boolean; draft: string; onDraftChange: (value: string) => void; onSettings: () => void;
}) {
  const { snapshot, error } = useConfiguration(active);
  const initialized = useRef(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ThinkingLevel | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const selectAgent = (id: string, config: ConfigurationSnapshot) => {
    const agent = config.agents.find(item => item.id === id && item.enabled);
    setAgentId(agent?.id ?? null);
    if (!agent) { setModelId(null); setThinking(null); return; }
    const resolved = resolveModelRole(config, agent.modelRole ?? "default");
    setModelId(resolved.error ? null : resolved.modelId); setThinking(resolved.thinking);
    setSelectionError(resolved.error ? s("This agent’s default model configuration is unavailable. Select a model or update settings.", "此代理的默认模型配置不可用，请选择模型或修改设置。") : null);
  };
  useEffect(() => {
    if (!snapshot) return;
    if (!initialized.current) {
      initialized.current = true;
      selectAgent("worker", snapshot);
      return;
    }
  }, [snapshot]);
  // 读取后的可用状态直接用于渲染；不回写/清空先前选择，也不重取 agent 默认值。
  const models = snapshot?.models.filter(model => resolveProviderModel(snapshot, model.id)) ?? [];
  const model = snapshot ? resolveProviderModel(snapshot, modelId)?.model : null;
  const agent = snapshot?.agents.find(item => item.id === agentId && item.enabled);
  const unavailable = snapshot && ((agentId && !agent) || (modelId && !model)) ? s("The selected configuration is unavailable. Choose again.", "已选配置不可用，请重新选择。") : null;
  return <div className="home-page"><div className="home-content">
    <header className="mb-8 flex flex-col items-center text-center">
      <WeftMark className="mb-4 size-12 text-primary" /><h1 className="type-page">{t.appName}</h1>
      <p className="type-body mt-2 text-muted-foreground">{t.homePrompt}</p>
    </header>
    <form className="home-composer" onSubmit={event => event.preventDefault()} aria-label={t.newConversation}>
      <label htmlFor="home-message" className="sr-only">{t.firstMessage}</label>
      <Textarea id="home-message" variant="plain" className="min-h-40 resize-none px-4 py-4" rows={5} maxLength={100_000}
        placeholder={t.homePlaceholder} value={draft} onChange={event => onDraftChange(event.target.value)} aria-describedby="home-availability" />
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select value={agent?.id ?? ""} disabled={!snapshot} onValueChange={id => snapshot && selectAgent(id, snapshot)}>
            <SelectTrigger aria-label={t.agent} className="w-32"><SelectValue placeholder={t.agent} /></SelectTrigger>
            <SelectContent>{snapshot?.agents.filter(agent => agent.enabled).map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={model?.id ?? ""} disabled={!snapshot || !models.length} onValueChange={id => {
            setModelId(id); setSelectionError(null); if (!models.find(item => item.id === id)?.capabilities.reasoning) setThinking("off");
          }}>
            <SelectTrigger aria-label={t.model} className="w-48"><SelectValue placeholder={models.length ? t.model : s("Add a model in settings", "先在设置中添加模型")} /></SelectTrigger>
            <SelectContent>{models.map(item => <SelectItem key={item.id} value={item.id}>{snapshot?.providers.find(provider => provider.id === item.providerId)?.name} / {item.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={model?.capabilities.reasoning ? thinking ?? "__default" : "off"} disabled={!model?.capabilities.reasoning}
            onValueChange={value => setThinking(value === "__default" ? null : value as ThinkingLevel)}>
            <SelectTrigger aria-label={s("Thinking level", "思考等级")} className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__default">{s("Default", "默认")}</SelectItem>{thinkingSchema.options.map(level => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <IconButton label={t.sendMessage} type="submit" variant="default" className="size-8" disabled aria-describedby="home-availability"><ArrowUp /></IconButton>
      </div>
    </form>
    {(error || unavailable || selectionError) && <p role="alert" className="mt-3 text-center text-xs text-destructive">{error ?? unavailable ?? selectionError}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
      <p id="home-availability" className="type-caption">{t.homeUnavailable}</p>
      <Button variant="ghost" size="sm" onClick={onSettings}><Settings />{t.menuSettings}</Button>
    </div>
  </div></div>;
}
