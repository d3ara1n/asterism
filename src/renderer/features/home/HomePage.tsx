import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Bot, Brain, ChevronDown, Cpu, Settings } from "lucide-react";
import { resolveModelRole, resolveProviderModel, thinkingSchema, type ConfigurationSnapshot, type ThinkingLevel } from "../../../shared/configuration";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "../../shared/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "../../shared/ui/input-group";
import { Showcase, showcaseSpell } from "../showcase/Showcase";
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
  return <div className="home-page"><div className="home-content">
    <header className="mb-8 flex flex-col items-center text-center">
      <WeftMark className="mb-4 size-12 text-primary" /><h1 className="type-page">{t.appName}</h1>
      <p className="type-body mt-2 text-muted-foreground">{t.homePrompt}</p>
    </header>
    {/* 两层输入区：亮色输入表面在上，灰色选项托盘挂在下方；选项为紧凑的幽灵按钮 + 菜单，不用表单下拉框。 */}
    <form onSubmit={event => event.preventDefault()} aria-label={t.newConversation} className="rounded-xl border bg-muted">
      <InputGroup className="rounded-xl border-0 border-b bg-card shadow-none">
        <label htmlFor="home-message" className="sr-only">{t.firstMessage}</label>
        <InputGroupTextarea id="home-message" className="min-h-32 px-4 py-4" rows={4} maxLength={100_000}
          placeholder={t.homePlaceholder} value={draft} onChange={event => onDraftChange(event.target.value)} aria-describedby="home-availability"
          onKeyDown={event => {
            // 彩蛋：完整输入口令后回车打开组件展示，不进入命令系统。
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || draft.trim() !== showcaseSpell) return;
            event.preventDefault(); onDraftChange(""); setShowcase(true);
          }} />
        <InputGroupAddon align="block-end" className="justify-end">
          <Button size="icon-sm" className="rounded-full" aria-label={t.sendMessage} title={t.sendMessage} type="submit" disabled aria-describedby="home-availability"><ArrowUp /></Button>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex min-w-0 flex-wrap items-center gap-0.5 px-1.5 py-1">
        <Choice icon={<Bot />} label={t.agent} value={agent?.name ?? t.agent} disabled={!snapshot}
          selected={agent?.id ?? ""} onSelect={id => snapshot && selectAgent(id, snapshot)}
          options={snapshot?.agents.filter(item => item.enabled).map(item => ({ value: item.id, label: item.name })) ?? []} />
        <Choice icon={<Cpu />} label={t.model} disabled={!snapshot || !models.length}
          value={model?.name ?? (models.length ? t.model : s("Add a model in settings", "先在设置中添加模型"))}
          selected={model?.id ?? ""} onSelect={id => { setModelId(id); setSelectionError(null); if (!models.find(item => item.id === id)?.capabilities.reasoning) setThinking("off"); }}
          options={models.map(item => ({ value: item.id, label: `${snapshot?.providers.find(provider => provider.id === item.providerId)?.name ?? ""} / ${item.name}` }))} />
        <Choice icon={<Brain />} label={s("Thinking level", "思考等级")} disabled={!model?.capabilities.reasoning}
          value={!model?.capabilities.reasoning ? s("Off", "关闭") : thinking ?? s("Default", "默认")}
          selected={model?.capabilities.reasoning ? thinking ?? "__default" : "off"}
          onSelect={value => setThinking(value === "__default" ? null : value as ThinkingLevel)}
          options={[{ value: "__default", label: s("Default", "默认") }, ...thinkingSchema.options.map(level => ({ value: level, label: level }))]} />
      </div>
    </form>
    {(error || unavailable || selectionError) && <p role="alert" className="mt-3 text-center text-xs text-destructive">{error ?? unavailable ?? selectionError}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
      <p id="home-availability" className="type-caption">{t.homeUnavailable}</p>
      <Button variant="ghost" size="sm" onClick={onSettings}><Settings />{t.menuSettings}</Button>
    </div>
    <Showcase open={showcase} onOpenChange={setShowcase} />
  </div></div>;
}

/** 托盘中的紧凑选项：幽灵小按钮显示当前值，点击弹出单选菜单。 */
function Choice({ icon, label, value, selected, options, disabled, onSelect }: {
  icon: ReactNode; label: string; value: string; selected: string; disabled?: boolean;
  options: { value: string; label: string }[]; onSelect: (value: string) => void;
}) {
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="xs" disabled={disabled} aria-label={`${label}: ${value}`} className="max-w-48 text-muted-foreground hover:text-foreground">
        {icon}<span className="truncate">{value}</span><ChevronDown className="opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-44">
      <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={selected} onValueChange={onSelect}>
        {options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
