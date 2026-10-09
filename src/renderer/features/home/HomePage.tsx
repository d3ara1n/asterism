import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Brain, Cpu, Settings } from "lucide-react";
import { resolveModelRole, resolveProviderModel, thinkingSchema, type ConfigurationSnapshot, type ThinkingLevel } from "../../../shared/configuration";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { ConfigurationChoice as Choice } from "../configuration/ConfigurationChoice";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "../../shared/ui/input-group";
import { Showcase, showcaseSpell } from "../showcase/Showcase";
import { WeftMark } from "../../shared/ui/weft-mark";
import { s, useConfiguration } from "../configuration/state";
import type { SessionCommand } from "../../../shared/session";

export type StartInput = Omit<Extract<SessionCommand, { type: "start" }>, "type" | "submissionId">;

/** 应用级草稿入口；取用配置填入选择，但不订阅角色变化去刷新已选 agent 的默认值。 */
export function HomePage({ active, draft, onDraftChange, onSettings, ready, busy, submitError, onStart }: {
  active: boolean; draft: string; onDraftChange: (value: string) => void; onSettings: () => void;
  ready: boolean; busy: boolean; submitError: string | null; onStart: (input: StartInput) => Promise<void>;
}) {
  const { snapshot, error } = useConfiguration(active);
  const initialized = useRef(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ThinkingLevel | null>(null);
  const [showcase, setShowcase] = useState(false);
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
  const canSend = ready && !busy && !!agent && !!model && !!draft.trim() && !unavailable;
  return <div className="home-page"><div className="home-content">
    <header className="mb-8 flex flex-col items-center text-center">
      <WeftMark className="mb-4 size-12 text-primary" /><h1 className="type-page">{t.appName}</h1>
      <p className="type-body mt-2 text-muted-foreground">{t.homePrompt}</p>
    </header>
    {/* 两层输入区：亮色输入表面在上，灰色选项托盘挂在下方；选项为紧凑的幽灵按钮 + 菜单，不用表单下拉框。 */}
    <form onSubmit={event => {
      event.preventDefault();
      if (canSend) void onStart({ agentConfigurationId: agent!.id, modelId: model!.id, thinking, text: draft.trim() });
    }} aria-label={t.newConversation} className="rounded-xl border bg-muted">
      <InputGroup className="rounded-xl border-0 border-b bg-card shadow-none">
        <label htmlFor="home-message" className="sr-only">{t.firstMessage}</label>
        <InputGroupTextarea id="home-message" className="min-h-32 px-4 py-4" rows={4} maxLength={100_000}
          placeholder={t.homePlaceholder} value={draft} disabled={busy} onChange={event => onDraftChange(event.target.value)} aria-describedby="home-availability"
          onKeyDown={event => {
            // 彩蛋：完整输入口令后回车打开组件展示，不进入命令系统。
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (draft.trim() === showcaseSpell) { onDraftChange(""); setShowcase(true); }
            else event.currentTarget.form?.requestSubmit();
          }} />
        <InputGroupAddon align="block-end" className="justify-end">
          <Button size="icon-sm" className="rounded-full" aria-label={t.sendMessage} title={t.sendMessage} type="submit" disabled={!canSend} aria-describedby="home-availability"><ArrowUp /></Button>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex min-w-0 flex-wrap items-center gap-0.5 px-1.5 py-1">
        <Choice icon={<Bot />} label={t.agent} value={agent?.name ?? t.agent} disabled={!snapshot || busy}
          selected={agent?.id ?? ""} onSelect={id => snapshot && selectAgent(id, snapshot)}
          options={snapshot?.agents.filter(item => item.enabled).map(item => ({ value: item.id, label: item.name })) ?? []} />
        <Choice icon={<Cpu />} label={t.model} disabled={!snapshot || !models.length || busy}
          value={model?.name ?? (models.length ? t.model : s("Add a model in settings", "先在设置中添加模型"))}
          selected={model?.id ?? ""} onSelect={id => { setModelId(id); setSelectionError(null); }}
          options={models.map(item => ({ value: item.id, label: `${snapshot?.providers.find(provider => provider.id === item.providerId)?.name ?? ""} / ${item.name}` }))} />
        <Choice icon={<Brain />} label={s("Thinking level", "思考等级")} disabled={!model?.capabilities.reasoning || busy}
          value={!model?.capabilities.reasoning ? s("Off", "关闭") : thinking ?? s("Default", "默认")}
          selected={model?.capabilities.reasoning ? thinking ?? "__default" : "off"}
          onSelect={value => setThinking(value === "__default" ? null : value as ThinkingLevel)}
          options={[{ value: "__default", label: s("Default", "默认") }, ...thinkingSchema.options.map(level => ({ value: level, label: level }))]} />
      </div>
    </form>
    {(submitError || error || unavailable || selectionError) && <p role="alert" className="mt-3 text-center text-xs text-destructive">{submitError ?? error ?? unavailable ?? selectionError}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
      <p id="home-availability" role="status" className="type-caption">{busy ? s("Starting conversation…", "正在创建会话…") : !ready ? t.statusUnavailable : s("Enter to send · Shift + Enter for a new line", "Enter 发送 · Shift + Enter 换行")}</p>
      <Button variant="ghost" size="sm" onClick={onSettings}><Settings />{t.menuSettings}</Button>
    </div>
    <Showcase open={showcase} onOpenChange={setShowcase} />
  </div></div>;
}
