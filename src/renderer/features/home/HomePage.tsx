import { ArrowUp, Bot, Cpu, Brain, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { resolveProviderModel, thinkingSchema, type ConfigurationSnapshot, type ThinkingLevel, modelReference } from "../../../shared/configuration";
import type { SessionCommand } from "../../../shared/session";
import { appMessages } from "../../messages/app";
import { commonMessages } from "../../messages/common";
import { homeMessages } from "../../messages/home";
import { ConfigurationChoice as Choice } from "../../shared/ConfigurationChoice";
import { useI18n } from "../../shared/i18n";
import { BrandMark } from "../../shared/ui/brand-mark";
import { Button } from "../../shared/ui/button";
import { InputGroup, InputGroupTextarea, InputGroupAddon } from "../../shared/ui/input-group";
import { initialAgentSelection } from "../configuration/agent-selection";
import { useConfiguration } from "../configuration/state";
import { Showcase, showcaseSpell } from "../showcase/Showcase";

export type StartInput = Omit<Extract<SessionCommand, { type: "start" }>, "type" | "submissionId">;

/** 应用级草稿入口；取用配置填入选择，但不订阅角色变化去刷新已选 agent 的默认值。 */
const thinkingLabels = { off: commonMessages.thinkingOff, minimal: commonMessages.thinkingMinimal, low: commonMessages.thinkingLow, medium: commonMessages.thinkingMedium, high: commonMessages.thinkingHigh, xhigh: commonMessages.thinkingXhigh };

export function HomePage({ active, draft, onDraftChange, onSettings, ready, busy, submitError, onStart }: {
  active: boolean; draft: string; onDraftChange: (value: string) => void; onSettings: () => void;
  ready: boolean; busy: boolean; submitError: import("@atelier/sdk/contracts").UiText | null; onStart: (input: StartInput) => Promise<void>;
}) {
  const i18n = useI18n();
  const { snapshot, error } = useConfiguration(active);
  const initialized = useRef(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ThinkingLevel | null>(null);
  const [showcase, setShowcase] = useState(false);
  const [selectionError, setSelectionError] = useState<import("@atelier/sdk/contracts").UiText | null>(null);
  const selectAgent = (id: string, config: ConfigurationSnapshot) => {
    const resolved = initialAgentSelection(config, id);
    setAgentId(resolved.agentId);
    setModelId(resolved.modelId); setThinking(resolved.thinking);
    setSelectionError(resolved.error ? homeMessages.agentModelUnavailable : null);
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
  const models = snapshot?.models.filter(model => resolveProviderModel(snapshot, modelReference(model))) ?? [];
  const model = snapshot ? resolveProviderModel(snapshot, modelId)?.model : null;
  const agent = snapshot?.agents.find(item => item.id === agentId && item.enabled);
  const unavailable = snapshot && ((agentId && !agent) || (modelId && !model)) ? i18n.formatMessage(homeMessages.configurationUnavailable) : null;
  const canSend = ready && !busy && !!agent && !!model && !!draft.trim() && !unavailable;
  return <div className="home-page"><div className="home-content">
    <header className="mb-8 flex flex-col items-center text-center">
      <BrandMark className="mb-4 size-12 text-primary" /><h1 className="type-page">{i18n.formatMessage(appMessages.appName)}</h1>
      <p className="type-body mt-2 text-muted-foreground">{i18n.formatMessage(homeMessages.homePrompt)}</p>
    </header>
    {/* 两层输入区：亮色输入表面在上，灰色选项托盘挂在下方；选项为紧凑的幽灵按钮 + 菜单，不用表单下拉框。 */}
    <form onSubmit={event => {
      event.preventDefault();
      if (canSend) void onStart({ agent: agent!.id, model: modelReference(model!), thinking, text: draft.trim() });
    }} aria-label={i18n.formatMessage(commonMessages.newConversation)} className="rounded-xl border bg-muted">
      <InputGroup className="rounded-xl border-0 border-b bg-card shadow-none">
        <label htmlFor="home-message" className="sr-only">{i18n.formatMessage(homeMessages.firstMessage)}</label>
        <InputGroupTextarea id="home-message" className="min-h-32 px-4 py-4" rows={4} maxLength={100_000}
          placeholder={i18n.formatMessage(homeMessages.homePlaceholder)} value={draft} disabled={busy} onChange={event => onDraftChange(event.target.value)} aria-describedby="home-availability"
          onKeyDown={event => {
            // 彩蛋：完整输入口令后回车打开组件展示，不进入命令系统。
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (draft.trim() === showcaseSpell) { onDraftChange(""); setShowcase(true); }
            else event.currentTarget.form?.requestSubmit();
          }} />
        <InputGroupAddon align="block-end" className="justify-end">
          <Button size="icon-sm" className="rounded-full" aria-label={i18n.formatMessage(commonMessages.sendMessage)} title={i18n.formatMessage(commonMessages.sendMessage)} type="submit" disabled={!canSend} aria-describedby="home-availability"><ArrowUp /></Button>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex min-w-0 flex-wrap items-center gap-0.5 px-1.5 py-1">
        <Choice icon={<Bot />} label={i18n.formatMessage(commonMessages.agent)} value={agent?.name ?? i18n.formatMessage(commonMessages.agent)} disabled={!snapshot || busy}
          selected={agent?.id ?? ""} onSelect={id => snapshot && selectAgent(id, snapshot)}
          options={snapshot?.agents.filter(item => item.enabled).map(item => ({ value: item.id, label: item.name })) ?? []} />
        <Choice icon={<Cpu />} label={i18n.formatMessage(commonMessages.model)} disabled={!snapshot || !models.length || busy}
          value={model?.name ?? (models.length ? i18n.formatMessage(commonMessages.model) : i18n.formatMessage(homeMessages.addModel))}
          selected={(model ? modelReference(model) : "")} onSelect={id => { setModelId(id); setSelectionError(null); }}
          options={models.map(item => ({ value: modelReference(item), label: `${snapshot?.providers.find(provider => provider.id === item.providerId)?.name ?? ""} / ${item.name}` }))} />
        <Choice icon={<Brain />} label={i18n.formatMessage(homeMessages.thinkingLevel)} disabled={!model?.capabilities.reasoning || busy}
          value={!model?.capabilities.reasoning ? i18n.formatMessage(homeMessages.thinkingOff) : thinking ? i18n.text(thinkingLabels[thinking]) : i18n.formatMessage(homeMessages.defaultThinking)}
          selected={model?.capabilities.reasoning ? thinking ?? "__default" : "off"}
          onSelect={value => setThinking(value === "__default" ? null : value as ThinkingLevel)}
          options={[{ value: "__default", label: i18n.formatMessage(homeMessages.defaultModel) }, ...thinkingSchema.options.map(level => ({ value: level, label: i18n.text(thinkingLabels[level]) }))]} />
      </div>
    </form>
    {(submitError || error || unavailable || selectionError) && <p role="alert" className="mt-3 text-center text-xs text-destructive">{i18n.text(submitError ?? error ?? unavailable ?? selectionError ?? "")}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
      <p id="home-availability" role="status" className="type-caption">{busy ? i18n.formatMessage(homeMessages.startingConversation) : !ready ? i18n.formatMessage(commonMessages.statusUnavailable) : i18n.formatMessage(homeMessages.keyboardHint)}</p>
      <Button variant="ghost" size="sm" onClick={onSettings}><Settings />{i18n.formatMessage(appMessages.menuSettings)}</Button>
    </div>
    <Showcase open={showcase} onOpenChange={setShowcase} />
  </div></div>;
}
