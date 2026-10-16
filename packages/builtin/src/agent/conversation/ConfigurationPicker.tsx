import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Brain, ChevronDown, ChevronRight, Cpu, type LucideIcon } from "lucide-react";
import { availableThinkingLevels, type ThinkingLevel } from "@atelier/sdk/contracts";
import { useI18n, useRendererCatalogs } from "@atelier/sdk/renderer";
import { type AgentSelection, ModelConfiguration, resolveAgentModelSelection } from "@atelier/builtin-api/contracts";
import { commonMessages } from "@atelier/ui/messages/common";
import { modelSelectionMessages, thinkingLabels } from "@atelier/ui/messages/model-selection";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@atelier/ui/ui/popover";
import { Separator } from "@atelier/ui/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@atelier/ui/ui/tooltip";
import { cn } from "@atelier/ui/utils";
import { formatCount } from "@atelier/ui/format-count";
import { configurationMessages } from "../../messages/configuration";
import { ConfigurationOptions, type ConfigurationChoice } from "./ConfigurationOptions";
import { ProviderOptions, ProviderModels } from "./ModelPicker";

type Page = "agent" | "model" | "thinking";
const FOLLOW = "__agent_default";

export function AgentConfigurationPicker({ selection, disabled, onChange }: {
  selection: AgentSelection; disabled: boolean;
  onChange(selection: AgentSelection): Promise<boolean>;
}) {
  const i18n = useI18n();
  const configuration = useRendererCatalogs().get(ModelConfiguration);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const providerFocus = useRef<string>("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const returnTo = useRef<Page>("agent");
  const rows = useRef<Partial<Record<Page, HTMLButtonElement | null>>>({});
  const blocked = disabled || saving || !configuration;
  const selectedAgent = configuration?.agents.find(agent => agent.id === selection.agent && agent.enabled);
  const resolved = configuration ? resolveAgentModelSelection(configuration, selection) : null;
  const model = resolved?.model ?? null;
  const levels = availableThinkingLevels(model);
  const unsupported = model?.capabilities.reasoning === false;
  const unavailable = i18n.text(configurationMessages.unavailable);
  const modelLabel = (value: typeof resolved) => value?.model?.name
    ?? (value?.reference ? i18n.formatMessage(modelSelectionMessages.unavailable, { value: value.reference }) : i18n.text(configurationMessages.noModel));
  const thinkingLabel = (thinking: ThinkingLevel | null) => {
    if (!model) return unavailable;
    if (unsupported) return i18n.text(configurationMessages.noThinking);
    if (thinking === null) return i18n.text(configurationMessages.noThinkingLevel);
    const label = i18n.text(thinkingLabels[thinking]);
    return levels.includes(thinking) ? label : i18n.formatMessage(modelSelectionMessages.unavailable, { value: label });
  };
  const modelName = modelLabel(resolved);
  const thinkingName = thinkingLabel(resolved?.thinking ?? null);
  const selectionTitle = i18n.text(configurationMessages.selectionTitle);
  const follow = i18n.text(modelSelectionMessages.agentDefault);
  const labels = { agent: i18n.text(commonMessages.agent), model: i18n.text(commonMessages.model), thinking: i18n.text(commonMessages.thinkingTitle) };
  const icons = { agent: Bot, model: Cpu, thinking: Brain };
  const values = {
    agent: selectedAgent?.name ?? i18n.text(configurationMessages.unavailableAgent),
    model: modelName,
    thinking: thinkingName,
  };
  const contextWindow = model?.contextWindow == null ? i18n.text(configurationMessages.unknownContext)
    : formatCount(model.contextWindow);
  const defaultModel = configuration ? resolveAgentModelSelection(configuration, { ...selection, model: null }) : null;
  const defaultThinking = configuration ? resolveAgentModelSelection(configuration, { ...selection, thinking: null }).thinking : null;
  const options: Record<Exclude<Page, "model">, ConfigurationChoice[]> = {
    agent: configuration?.agents.filter(agent => agent.enabled).map(agent => ({
      value: agent.id, label: agent.name, description: agent.description,
    })) ?? [],
    thinking: [{ value: FOLLOW, label: follow, description: thinkingLabel(defaultThinking) },
      ...levels.map(level => ({ value: level, label: i18n.text(thinkingLabels[level]) }))],
  };
  const selected = { agent: selection.agent, model: selection.model ?? FOLLOW, thinking: selection.thinking ?? FOLLOW };
  const provider = configuration?.providers.find(item => item.id === providerId);
  const browsingModels = page === "model" && providerId !== null;
  function back() {
    if (browsingModels) setProviderId(null);
    else setPage(null);
  }

  // 二级页面返回后恢复到原配置行；关闭整个浮层由 Popover 恢复触发器焦点。
  useLayoutEffect(() => {
    if (open && page === null && !blocked) rows.current[returnTo.current]?.focus({ preventScroll: true });
  }, [open, page, blocked]);

  async function choose(field: Page, value: string) {
    if (blocked || submitting.current) return;
    const next = { ...selection };
    if (field === "agent") next.agent = value;
    else if (field === "model") next.model = value === FOLLOW ? null : value;
    else next.thinking = value === FOLLOW ? null : value as ThinkingLevel;
    if (selected[field] === value) { setPage(null); return; }
    submitting.current = true;
    setSaving(true);
    try {
      if (await onChange(next)) setPage(null);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return <Popover open={open} onOpenChange={value => {
    setOpen(value);
    if (value) { setPage(null); returnTo.current = "agent"; }
  }}>
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="xs" disabled={disabled || !configuration}
            className="min-w-0 max-w-full shrink gap-1.5"
            aria-label={`${labels.agent}: ${values.agent}, ${labels.model}: ${modelName}, ${labels.thinking}: ${thinkingName}, ${i18n.text(configurationMessages.contextWindow)}: ${contextWindow}`}>
            <Bot data-icon="inline-start" />
            <span className="max-w-44 truncate">{modelName}</span>
            <Separator orientation="vertical" className="mx-0.5 self-center data-[orientation=vertical]:h-3" />
            <span className="shrink-0 text-muted-foreground">{thinkingName}</span>
            <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent>
        {values.agent} · {modelName} · {thinkingName} · {contextWindow}
      </TooltipContent>
    </Tooltip>
    <PopoverContent side="top" align="start" collisionPadding={8} aria-label={selectionTitle}
      className={cn("nodrag nopan flex max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0",
        browsingModels ? "w-[42rem]" : "w-80")}
      onKeyDown={event => event.stopPropagation()}
      onEscapeKeyDown={event => {
        if (page !== null) { event.preventDefault(); back(); }
      }}>
      {page === null ? <div className="flex flex-col gap-0.5 overflow-y-auto p-1">
        {(["agent", "model", "thinking"] as const).map(field => <ConfigurationRow key={field}
          ref={element => { rows.current[field] = element; }} icon={icons[field]} label={labels[field]} value={values[field]}
          disabled={blocked || (field === "thinking" && unsupported)}
          onClick={() => {
            returnTo.current = field;
            setProviderId(null);
            providerFocus.current = model ? `provider:${model.providerId}` : FOLLOW;
            setPage(field);
          }} />)}
      </div> : <>
        <div className="flex shrink-0 items-center gap-2 px-2 py-1.5">
          <IconButton label={i18n.text(commonMessages.back)} size="icon-xs" onClick={back}><ArrowLeft /></IconButton>
          <span className="type-label truncate">{browsingModels ? provider?.name ?? providerId : labels[page]}</span>
        </div>
        <Separator />
        {page === "model" ? (providerId !== null
          ? <ProviderModels key={providerId} configuration={configuration} providerId={providerId}
              selected={selection.model} effectiveModel={model} disabled={blocked}
              onSelect={value => { void choose("model", value); }} />
          : <ProviderOptions configuration={configuration} follow={{ value: FOLLOW, label: follow, description: modelLabel(defaultModel) }}
              selected={selected.model} initialActive={providerFocus.current} disabled={blocked}
              onFollow={() => { void choose("model", FOLLOW); }}
              onProvider={id => { providerFocus.current = `provider:${id}`; setProviderId(id); }} />)
          : <ConfigurationOptions key={page} label={labels[page]} options={options[page]} selected={selected[page]}
              disabled={blocked || (page === "thinking" && unsupported)}
              onSelect={value => { void choose(page, value); }} />}
      </>}
      <Separator />
      <p aria-live="polite" className="type-caption shrink-0 px-3 py-2 text-muted-foreground">
        {i18n.text(saving ? commonMessages.statusBusy : configurationMessages.nextRequestHint)}
      </p>
    </PopoverContent>
  </Popover>;
}

function ConfigurationRow({ icon: Icon, label, value, ...props }: React.ComponentProps<typeof Button> & {
  icon: LucideIcon; label: string; value: string;
}) {
  return <Button variant="ghost" size="sm" className="w-full justify-start gap-2" title={`${label}: ${value}`} {...props}>
    <Icon data-icon="inline-start" className="text-muted-foreground" />
    <span className="shrink-0">{label}</span>
    <span className="ml-auto truncate text-muted-foreground">{value}</span>
    <ChevronRight data-icon="inline-end" className="text-muted-foreground" />
  </Button>;
}
