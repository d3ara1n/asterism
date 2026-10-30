import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { ArrowLeft, Bot, Brain, ChevronDown, ChevronRight, Cpu, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { availableThinkingLevels, type ThinkingLevel } from "@asterism-app/sdk/contracts";
import { useI18n } from "@asterism-app/sdk/renderer";
import { type AgentSelection, resolveAgentModelSelection } from "@asterism-app/builtin-api/contracts";
import { useSettingsConfiguration } from "../../configuration/renderer-state";
import { useAgentModelSelection } from "@asterism-app/builtin-api/renderer";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { modelSelectionMessages, thinkingLabels } from "@asterism-app/ui/messages/model-selection";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { Separator } from "@asterism-app/ui/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { formatCount } from "@asterism-app/ui/format-count";
import { StatusText } from "@asterism-app/ui/ui/status";
import { configurationMessages } from "../../messages/configuration";
import { ConfigurationOptions, type ConfigurationChoice } from "./ConfigurationOptions";
import { ProviderOptions, ProviderModels } from "./ModelPicker";

type Page = "agent" | "model" | "thinking";
const FOLLOW = "__agent_default";

/** forward(+1): the new page enters from the right and the old page exits to the left; back(-1): the reverse. */
const SLIDE_X = 8;
const PAGE_DURATION = 0.18;
const PAGE_EASE = [0, 0, 0.2, 1] as const;

const pageVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * SLIDE_X }),
  center: {
    opacity: 1, x: 0, pointerEvents: "auto",
    transition: { type: "tween", duration: PAGE_DURATION, ease: PAGE_EASE },
  },
  exit: (dir: number) => ({
    opacity: 0, x: dir * -SLIDE_X, pointerEvents: "none",
    transition: { type: "tween", duration: 0.1, ease: [0.4, 0, 1, 1] },
  } as const),
} as const;

const reducedPageVariants = {
  enter: () => ({ opacity: 1, x: 0 }),
  center: { opacity: 1, x: 0, pointerEvents: "auto", transition: { duration: 0 } },
  exit: () => ({ opacity: 0, x: 0, pointerEvents: "none", transition: { duration: 0 } }),
} as const;

export function AgentConfigurationPicker({ selection, disabled, onChange }: {
  selection: AgentSelection; disabled: boolean;
  onChange(selection: AgentSelection): Promise<boolean>;
}) {
  const i18n = useI18n();
  const { snapshot: configuration, readError } = useSettingsConfiguration();
  const resolved = useAgentModelSelection();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const providerFocus = useRef<string>("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const returnTo = useRef<Page>("agent");
  const rows = useRef<Partial<Record<Page, HTMLButtonElement | null>>>({});
  const direction = useRef<1 | -1>(1);
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedPageVariants : pageVariants;
  const blocked = disabled || saving || !configuration;
  const selectedAgent = configuration?.agents.find(agent => agent.id === selection.agent && agent.enabled);
  const model = resolved?.model ?? null;
  const levels = availableThinkingLevels(model);
  const unsupported = model?.capabilities.reasoning === false;
  const unavailable = i18n.text(configurationMessages.unavailable);
  const modelLabel = (value: Pick<typeof resolved, "model" | "reference"> | null) => value?.model?.name
    ?? (value?.reference ? i18n.formatMessage(modelSelectionMessages.unavailable, { value: value.reference }) : i18n.text(configurationMessages.noModel));
  const thinkingLabel = (thinking: ThinkingLevel | null) => {
    if (!model) return unavailable;
    if (unsupported) return i18n.text(configurationMessages.noThinking);
    if (thinking === null) return i18n.text(modelSelectionMessages.providerDefault);
    return i18n.text(thinkingLabels[thinking]);
  };
  const modelName = modelLabel(resolved);
  const thinkingName = thinkingLabel(resolved?.thinking ?? null);
  const selectionTitle = i18n.text(configurationMessages.selectionTitle);
  const follow = i18n.text(modelSelectionMessages.agentDefault);
  const labels = { agent: i18n.text(commonMessages.agent), model: i18n.text(commonMessages.model), thinking: i18n.text(commonMessages.thinkingTitle) };
  const icons = { agent: Bot, model: Cpu, thinking: Brain };
  const values = {
    agent: selectedAgent?.id ?? i18n.text(configurationMessages.unavailableAgent),
    model: modelName,
    thinking: thinkingName,
  };
  const contextWindow = model?.contextWindow == null ? i18n.text(configurationMessages.unknownContext)
    : formatCount(model.contextWindow);
  const defaultModel = configuration ? resolveAgentModelSelection(configuration, { ...selection, model: null }) : null;
  const defaultThinking = configuration ? resolveAgentModelSelection(configuration, { ...selection, thinking: null }).thinking : null;
  const options: Record<Exclude<Page, "model">, ConfigurationChoice[]> = {
    agent: configuration?.agents.filter(agent => agent.enabled).map(agent => ({
      value: agent.id, label: agent.id, description: agent.description,
    })) ?? [],
    thinking: [{ value: FOLLOW, label: follow, description: thinkingLabel(defaultThinking) },
      ...levels.map(level => ({ value: level, label: i18n.text(thinkingLabels[level]) }))],
  };
  const selected = { agent: selection.agent, model: selection.model ?? FOLLOW, thinking: selection.thinking ?? FOLLOW };
  const provider = configuration?.modelProviders.find(item => item.id === providerId);
  const browsingModels = page === "model" && providerId !== null;
  const pageKey = browsingModels ? `provider:${providerId}` : page ?? "home";
  function navigate(nextPage: Page | null, nextDirection: 1 | -1, nextProviderId: string | null = null) {
    direction.current = nextDirection;
    setProviderId(nextProviderId);
    setPage(nextPage);
  }
  function back() {
    navigate(browsingModels ? "model" : null, -1);
  }

  // Returning from a secondary page restores focus to the original configuration row; Popover restores trigger focus when the entire popover closes.
  useLayoutEffect(() => {
    if (open && page === null && !blocked) rows.current[returnTo.current]?.focus({ preventScroll: true });
  }, [open, page, blocked]);

  async function choose(field: Page, value: string) {
    if (blocked || submitting.current) return;
    const next = { ...selection };
    if (field === "agent") next.agent = value;
    else if (field === "model") next.model = value === FOLLOW ? null : value;
    else next.thinking = value === FOLLOW ? null : value as ThinkingLevel;
    if (selected[field] === value) { navigate(null, -1); return; }
    submitting.current = true;
    setSaving(true);
    try {
      if (await onChange(next)) navigate(null, -1);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (readError) return <StatusText tone="error">{i18n.text(readError)}</StatusText>;
  return <Popover open={open} onOpenChange={value => {
    setOpen(value);
    if (value) { navigate(null, 1); returnTo.current = "agent"; }
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
    <ConfigurationPopover wide={browsingModels} pageKey={pageKey} reducedMotion={!!prefersReducedMotion}
      side="top" align="start" collisionPadding={8} aria-label={selectionTitle}
      onKeyDown={event => event.stopPropagation()}
      onEscapeKeyDown={event => {
        if (page !== null) { event.preventDefault(); back(); }
      }}>
      {/* Every route replaces one complete page; the shared footer stays outside page transitions. */}
      <div className="relative flex min-h-0 flex-col overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout" custom={direction.current}>
          <motion.div key={pageKey}
            custom={direction.current}
            variants={variants}
            initial="enter" animate="center" exit="exit"
            className="flex min-h-0 flex-col">
            {page === null ? <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto p-1">
              {(["agent", "model", "thinking"] as const).map(field => <ConfigurationRow key={field}
                ref={element => { rows.current[field] = element; }} icon={icons[field]} label={labels[field]} value={values[field]}
                disabled={blocked || (field === "thinking" && unsupported)}
                onClick={() => {
                  returnTo.current = field;
                  providerFocus.current = model ? `provider:${model.providerId}` : FOLLOW;
                  navigate(field, 1);
                }} />)}
            </div> : <>
              <div className="flex shrink-0 items-center gap-2 px-2 py-1.5">
                <IconButton label={i18n.text(commonMessages.back)} size="icon-xs" onClick={back}><ArrowLeft /></IconButton>
                <span className="type-label truncate">{browsingModels ? provider?.name ?? providerId : labels[page]}</span>
              </div>
              <Separator />
              {page === "model" ? (
                providerId !== null
                  ? <ProviderModels configuration={configuration} providerId={providerId}
                      selected={selection.model} effectiveModel={model} disabled={blocked}
                      onSelect={value => { void choose("model", value); }} />
                  : <ProviderOptions configuration={configuration}
                      follow={{ value: FOLLOW, label: follow, description: modelLabel(defaultModel) }}
                      selected={selected.model} initialActive={providerFocus.current} disabled={blocked}
                      onFollow={() => { void choose("model", FOLLOW); }}
                      onProvider={id => {
                        providerFocus.current = `provider:${id}`;
                        navigate("model", 1, id);
                      }} />
              ) : (
                <ConfigurationOptions label={labels[page]} options={options[page]} selected={selected[page]}
                  disabled={blocked || (page === "thinking" && unsupported)}
                  onSelect={value => { void choose(page, value); }} />
              )}
            </>}
          </motion.div>
        </AnimatePresence>
      </div>
      <Separator />
      <p aria-live="polite" className="type-caption shrink-0 px-3 py-2 text-muted-foreground">
        {i18n.text(saving ? commonMessages.statusBusy : configurationMessages.nextRequestHint)}
      </p>
    </ConfigurationPopover>
  </Popover>;
}

/** Measure natural content independently of the animated shell; the footer remains anchored at its bottom. */
function ConfigurationPopover({ wide, pageKey, reducedMotion, children, ...props }: Omit<ComponentProps<typeof PopoverContent>, "className" | "style" | "asChild"> & {
  wide: boolean; pageKey: string; reducedMotion: boolean;
}) {
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    if (!content) { setHeight(undefined); return; }
    const measure = () => setHeight(content.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [content, pageKey]);

  return <PopoverContent {...props}
    className="nodrag nopan relative max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-1rem)] overflow-hidden p-0"
    style={{
      boxSizing: "content-box",
      width: wide ? "42rem" : "20rem",
      height,
      transition: reducedMotion ? "none" : `width ${PAGE_DURATION}s cubic-bezier(${PAGE_EASE.join(",")}), height ${PAGE_DURATION}s cubic-bezier(${PAGE_EASE.join(",")})`,
    }}>
    <div ref={setContent} className="flex max-h-(--radix-popover-content-available-height) w-full flex-col"
      style={height === undefined ? undefined : { position: "absolute", bottom: 0 }}>
      {children}
    </div>
  </PopoverContent>;
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
