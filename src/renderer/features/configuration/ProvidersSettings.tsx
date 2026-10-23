import { Plus, Zap, Search, ExternalLink, PlugZap } from "lucide-react";
import { useMemo, useState } from "react";

import { canEditProviderField, createModelInput, modelReference, thinkingSchema, type ConfigurationSnapshot, type ConnectionTest, type Provider, type ProviderInput, type ProviderModel, type TestError } from "../../../shared/configuration";
import { providerPresetDraft, type ProviderPreset, type ProviderDraft } from "../../../shared/provider-presets";
import { commonMessages } from "@atelier/ui/messages/common";
import { providersMessages } from "../../messages/providers";
import { thinkingLabels } from "@atelier/ui/messages/model-selection";
import { getI18n, useI18n } from "../../shared/i18n";
import { Badge } from "@atelier/ui/ui/badge";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@atelier/ui/ui/empty";
import { ListRow } from "@atelier/ui/ui/list-row";
import { StatusBadge, StatusText, type StatusTone } from "@atelier/ui/ui/status";
import { Button } from "@atelier/ui/ui/button";
import { Checkbox } from "@atelier/ui/ui/checkbox";
import { FieldGroup, Field, FieldContent, FieldLabel, FieldDescription, FieldSet, FieldLegend } from "@atelier/ui/ui/field";
import { Input } from "@atelier/ui/ui/input";
import { ItemGroup, ItemSeparator, Item } from "@atelier/ui/ui/item";
import { Separator } from "@atelier/ui/ui/separator";
import { Spinner } from "@atelier/ui/ui/spinner";
import { Switch } from "@atelier/ui/ui/switch";
import { cn } from "@atelier/ui/utils";
import { useIsland } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Section } from "../settings/layout";
import { Editor, EditorSection, TextField, ChoiceField, NumberField } from "./forms";
import { useSettingsConfiguration } from "./state";
import { ModelCompatibilityEditor } from "./ModelCompatibilityEditor";
import { ModelCostEditor } from "./ModelCostEditor";
import { modelProtocolLabels } from "./protocols";
import { ModelDiscoveryPicker } from "./ModelDiscoveryPicker";
import { useModelParameters } from "./ModelParameters";
import { modelCatalogMessages } from "../../../shared/model-catalog-messages";
import { ProviderAuthentication, type ProviderCredentialDraft } from "./ProviderAuthentication";

const protocols = Object.entries(modelProtocolLabels).map(([value, label]) => ({ value, label }));
const protocolLabel = (value: string) => protocols.find(item => item.value === value)?.label ?? value;
type ProviderValue = ProviderDraft;

/* ---------- 状态推导：列表与详情共用，均直接读取最新快照 ---------- */

interface Health { tone: StatusTone; label: string }
const latestTest = (snapshot: ConfigurationSnapshot, modelId: string): ConnectionTest | undefined =>
  snapshot.tests.filter(test => test.model === modelId).at(-1);
function providerHealth(snapshot: ConfigurationSnapshot, provider: Provider): Health {
  if (!provider.enabled) return { tone: "neutral", label: getI18n().formatMessage(providersMessages.disabled) };
  if (provider.auth === "api_key" && provider.credentialState !== "available") return { tone: "warning", label: getI18n().formatMessage(providersMessages.needsApiKey) };
  const models = snapshot.models.filter(model => model.providerId === provider.id);
  if (!models.length) return { tone: "neutral", label: getI18n().formatMessage(providersMessages.noModels) };
  const tests = models.map(model => latestTest(snapshot, modelReference(model)));
  if (tests.some(test => test?.state === "failed")) return { tone: "error", label: getI18n().formatMessage(providersMessages.lastTestFailed) };
  if (tests.some(test => test?.state === "succeeded")) return { tone: "success", label: getI18n().formatMessage(providersMessages.connected) };
  return { tone: "neutral", label: getI18n().formatMessage(providersMessages.notTested) };
}
/** 按错误类别给出下一步；原始信息仍随结果展示。 */
const testHints = (): Record<TestError, string> => ({
  configuration: getI18n().formatMessage(providersMessages.invalidSettings),
  credential: getI18n().formatMessage(providersMessages.saveApiKey),
  authentication: getI18n().formatMessage(providersMessages.keyRejected),
  model_unavailable: getI18n().formatMessage(providersMessages.modelUnavailable),
  rate_limit: getI18n().formatMessage(providersMessages.rateLimited),
  network: getI18n().formatMessage(providersMessages.networkUnavailable),
  timeout: getI18n().formatMessage(providersMessages.timeout),
  protocol: getI18n().formatMessage(providersMessages.unexpectedResponse),
  server: getI18n().formatMessage(providersMessages.serverError),
  cancelled: getI18n().formatMessage(providersMessages.testCancelled),
});

/* ---------- 即时操作：与编辑草稿分离，任何浮岛中触发都写回同一快照 ---------- */

function useQuickActions() {
  const { snapshot, run } = useSettingsConfiguration();
  return {
    setProviderEnabled: (provider: Provider, enabled: boolean) => run({ type: "provider.save", id: provider.id, credential: { action: "keep" },
      value: { ...providerValue(provider), enabled } }),
    setModelEnabled: (model: ProviderModel, enabled: boolean) => run({ type: "model.save", id: modelReference(model), value: { ...modelValue(model), enabled } }),
    test: (model: ProviderModel) => {
      const running = snapshot && latestTest(snapshot, modelReference(model));
      return running?.state === "running" ? run({ type: "test.cancel", id: running.id }) : run({ type: "test.start", model: modelReference(model) });
    },
  };
}
/** 详情草稿与快捷操作共用字段投影，启用状态由各自操作显式提供。 */
const providerValue = (provider: Provider): ProviderValue => ({
  id: provider.id, name: provider.name, protocol: provider.protocol, baseUrl: provider.baseUrl, auth: provider.auth,
  compatibility: structuredClone(provider.compatibility),
  ...(provider.usage !== undefined && { usage: provider.usage }),
  ...(provider.fixedFields && { fixedFields: [...provider.fixedFields] }),
});
const modelValue = (model: ProviderModel): ProviderModel => structuredClone(model);

/* ---------- 根：提供商总览 ---------- */

export function ProvidersSettings() {
  const i18n = useI18n();
  const { snapshot, busy } = useSettingsConfiguration();
  const island = useIsland();
  const quick = useQuickActions();
  const open = (id: string | null, origin?: HTMLElement | null) => island.open({ id: `provider-${id ?? "new"}`, label: providersMessages.provider, width: panelIslandWidth, origin,
    render: () => id === null ? <ProviderCreation /> : <ProviderEditor key={id} initialId={id} /> });
  const providers = snapshot?.providers ?? [];
  return <Section title={i18n.formatMessage(providersMessages.connections)} hint={i18n.formatMessage(providersMessages.summary)}
    action={<Button size="sm" disabled={!snapshot} onClick={event => open(null, event.currentTarget)}><Plus />{i18n.formatMessage(providersMessages.addProvider)}</Button>}>
    {snapshot && !providers.length ? <Empty className="border">
      <EmptyHeader><EmptyMedia variant="icon"><Zap /></EmptyMedia><EmptyDescription>{i18n.formatMessage(providersMessages.emptyConnections)}</EmptyDescription></EmptyHeader>
      <EmptyContent><Button size="sm" variant="outline" onClick={event => open(null, event.currentTarget)}><Plus />{i18n.formatMessage(providersMessages.addFirstProvider)}</Button></EmptyContent>
    </Empty> : snapshot && <ItemGroup className="surface">{providers.map((provider, index) => {
      const count = snapshot.models.filter(model => model.providerId === provider.id).length;
      const health = providerHealth(snapshot, provider);
      return <div key={provider.id}>{index > 0 && <ItemSeparator />}
        <ListRow mediaVariant="icon" media={<span className="text-sm font-medium text-muted-foreground">{provider.name.trim().charAt(0).toUpperCase() || "?"}</span>}
          title={provider.name} selected={island.child === `provider-${provider.id}`} onOpen={origin => open(provider.id, origin)}
          description={<>{canEditProviderField(provider, "protocol") && <>{protocolLabel(provider.protocol)} · </>}{i18n.formatMessage(providersMessages.modelCount, { count: count })}</>}
          actions={<>
            <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
            <Switch aria-label={i18n.formatMessage(providersMessages.enableProvider, { provider_name: provider.name })} checked={provider.enabled} disabled={busy}
              onCheckedChange={next => void quick.setProviderEnabled(provider, next)} />
          </>} /></div>;
    })}</ItemGroup>}
  </Section>;
}

/* ---------- 预设选择：按计费方式分组，自适应网格与跨组搜索 ---------- */

const billingOrder = ["usage", "subscription", "none"] as const satisfies readonly ProviderPreset["billing"][];
const billingLabels = {
  usage: providersMessages.payAsYouGo,
  subscription: providersMessages.subscription,
  none: providersMessages.noBilling,
};
function presetDescription(preset: ProviderPreset, includeBilling = true): string {
  const i18n = getI18n();
  return [preset.region && i18n.text(preset.region), preset.plan && i18n.text(preset.plan), includeBilling && i18n.text(billingLabels[preset.billing])].filter(Boolean).join(" · ");
}
const searchThreshold = 8;
function PresetPicker({ onPick }: { onPick: (preset: ProviderPreset | null) => void }) {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  const providerPresets = snapshot?.providerPresets ?? [];
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = providerPresets.filter(preset => !q || [preset.name, preset.id, presetDescription(preset), ...(preset.keywords ?? [])].some(word => word.toLowerCase().includes(q)));
  const groups = billingOrder.map(billing => ({ billing, items: matches.filter(preset => preset.billing === billing) })).filter(entry => entry.items.length);
  const tile = "min-h-16 flex-col items-start justify-center gap-0.5 px-3 py-2 text-left hover:bg-accent";
  return <div className="flex flex-col gap-5">
    <p className="type-caption">{i18n.formatMessage(providersMessages.presetHint)}</p>
    {providerPresets.length > searchThreshold && <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input autoFocus className="pl-8" placeholder={i18n.formatMessage(providersMessages.searchProviders)} aria-label={i18n.formatMessage(providersMessages.searchProvidersLabel)} value={query} onChange={event => setQuery(event.target.value)} />
    </div>}
    {groups.map(({ billing, items }) => <section key={billing} aria-label={i18n.text(billingLabels[billing])}>
      <h3 className="type-label mb-2">{i18n.text(billingLabels[billing])}</h3>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))" }}>
        {items.map(preset => <div key={preset.id} className="flex flex-col gap-1">
          <Item asChild variant="outline" className={cn(tile, "bg-card")}><button type="button" onClick={() => onPick(preset)}>
            <span className="type-section max-w-full truncate">{preset.name}</span>
            {(preset.region || preset.plan) && <span className="type-caption">{presetDescription(preset, false)}</span>}
          </button></Item>
          {preset.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="type-caption inline-flex items-center gap-1 self-start px-1 hover:text-foreground">
            {i18n.formatMessage(providersMessages.getKey)}<ExternalLink className="size-3" aria-hidden="true" />
          </a>}
        </div>)}
      </div>
    </section>)}
    {q && !groups.length && <p className="type-caption">{i18n.formatMessage(providersMessages.noMatchingProvider)}</p>}
    <Item asChild variant="outline" className={cn(tile, "border-dashed")}><button type="button" onClick={() => onPick(null)}>
      <span className="type-section">{i18n.formatMessage(providersMessages.customConnection)}</span>
      <span className="type-caption">{i18n.formatMessage(providersMessages.customConnectionHint)}</span>
    </button></Item>
  </div>;
}

/* ---------- 提供商详情 ---------- */

/** 由显示名称规范化出 ID：小写、空白转连字符、去掉不允许的字符；模型 ID 允许 `/`。 */
export function slugify(name: string, options: { slash?: boolean } = {}): string {
  const allowed = options.slash ? /[^\p{L}\p{N}._\/-]/gu : /[^\p{L}\p{N}._-]/gu;
  return name.trim().toLowerCase().replace(/\s+/gu, "-").replace(allowed, "").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
}
const blank: ProviderValue = { id: "", name: "", protocol: "openai-responses", baseUrl: "", auth: "api_key", compatibility: [] };

/** 选择入口生成配置与编辑规则；编辑器不接收或保留预设身份。 */
function ProviderCreation() {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  const [initialValue, setInitialValue] = useState<ProviderValue | null>(null);
  if (initialValue) return <ProviderEditor initialId={null} initialValue={initialValue} />;
  return <Editor form="provider-form" title={i18n.formatMessage(providersMessages.confirmAddProvider)} dirty={false}>
    <PresetPicker onPick={picked => setInitialValue(picked ? {
      ...providerPresetDraft(picked, snapshot?.providers.map(provider => provider.id)),
      name: `${picked.name} · ${presetDescription(picked)}`,
    } : structuredClone(blank))} />
  </Editor>;
}

function ProviderEditor({ initialId, initialValue = blank }: { initialId: string | null; initialValue?: ProviderValue }) {
  const i18n = useI18n();
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const current = snapshot?.providers.find(item => item.id === id);
  // 草稿不含 enabled：启用是即时操作，始终取快照，避免与上级浮岛的开关互相覆盖。
  const [value, setValue] = useState<ProviderValue>(() => current ? providerValue(current) : structuredClone(initialValue));
  const [credential, setCredential] = useState<ProviderCredentialDraft>({ action: current ? "keep" : "replace", key: "" });
  const set = <K extends keyof typeof value>(field: K, next: (typeof value)[K]) => setValue(previous => ({ ...previous, [field]: next }));
  // 已填好的 ID 保持独立；空白连接在用户手动编辑 ID 前随名称生成。
  const [idEdited, setIdEdited] = useState(!!current || !!initialValue.id);
  const setName = (name: string) => setValue(previous => ({ ...previous, name, ...(idEdited ? {} : { id: slugify(name) }) }));

  const saved = current ? providerValue(current) : null;
  const credentialChanged = value.auth === "api_key" && (credential.action === "clear" || (credential.action === "replace" && credential.key.trim() !== ""));
  const dirty = !saved || JSON.stringify(saved) !== JSON.stringify(value) || credentialChanged;

  const openModel = (modelId: string | null, origin?: HTMLElement | null) => {
    if (id) island.open({ id: `model-${modelId ?? "new"}`, label: providersMessages.model, width: panelIslandWidth, origin,
      render: () => <ModelEditor key={modelId ?? "new"} initialId={modelId} providerId={id} /> });
  };
  const models = snapshot?.models.filter(model => model.providerId === id) ?? [];

  return <Editor form="provider-form" title={current?.name ?? i18n.formatMessage(providersMessages.newProvider)} dirty={dirty}
    description={canEditProviderField(value, "protocol") ? protocolLabel(value.protocol) : undefined}
    remove={current ? { title: i18n.formatMessage(providersMessages.deleteProviderTitle),
      description: i18n.formatMessage(providersMessages.deleteProviderDescription, { current_name: current.name, models_length: models.length }),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "provider", id: current.id }); if (result.ok) void island.close({ force: true }); } } : undefined}>
    <form id="provider-form" onSubmit={async event => {
      event.preventDefault();
      const result = await run({ type: "provider.save", id, value: { ...value, enabled: current?.enabled ?? true },
        credential: value.auth === "none" || credential.action === "clear" ? { action: "clear" }
          : credential.action === "replace" && credential.key.trim() ? { action: "replace", value: credential.key } : { action: "keep" } });
      if (result.ok) {
        const persisted = result.snapshot.providers.find(item => item.id === result.savedId);
        if (persisted) setValue(providerValue(persisted));
        setId(result.savedId);
        setCredential({ key: "", action: "keep" });
      }
    }}>
      <EditorSection title={i18n.formatMessage(providersMessages.connection)}><FieldGroup>
        <TextField label={i18n.formatMessage(providersMessages.displayName)} value={value.name} onChange={setName} required />
        <TextField label={i18n.formatMessage(providersMessages.providerId)} value={value.id} onChange={next => { setIdEdited(true); set("id", next); }} required hint={i18n.formatMessage(providersMessages.providerIdHint)} />
        {canEditProviderField(value, "protocol") && <ChoiceField label={i18n.formatMessage(providersMessages.protocol)} value={value.protocol} options={protocols} onChange={next => next && set("protocol", next as ProviderInput["protocol"])} />}
        {canEditProviderField(value, "baseUrl") && <TextField label={i18n.text(commonMessages.baseUrl)} value={value.baseUrl} onChange={next => set("baseUrl", next)} required
          hint={value.auth === "api_key" ? i18n.formatMessage(providersMessages.httpsRequired) : undefined} />}
        <ProviderAuthentication auth={value.auth} editable={canEditProviderField(value, "auth")}
          credentialState={current?.credentialState} storageAvailable={snapshot?.credentialStorageAvailable ?? false}
          draft={credential} onAuthChange={next => set("auth", next)} onDraftChange={setCredential} />
        {canEditProviderField(value, "usage") && <ChoiceField label={i18n.text(providersMessages.usage)}
          value={value.usage ? `usage:${value.usage}` : "__none"} onChange={next => next && set("usage", next === "__none" ? null : next.slice(6))}
          options={[{ value: "__none", label: i18n.text(providersMessages.usageOff) },
            ...(snapshot?.usageProviders ?? []).map(provider => ({ value: `usage:${provider.id}`, label: i18n.text(provider.label) })),
            ...(value.usage && !snapshot?.usageProviders?.some(provider => provider.id === value.usage)
              ? [{ value: `usage:${value.usage}`, label: i18n.formatMessage(providersMessages.usageMissing, { id: value.usage }) }] : [])]} />}
      </FieldGroup></EditorSection>
      {canEditProviderField(value, "compatibility") && <ModelCompatibilityEditor value={value.compatibility} onChange={next => set("compatibility", next)} />}
    </form>

    {current && snapshot && <EditorSection title={i18n.formatMessage(providersMessages.models)}
      hint={dirty ? i18n.text(providersMessages.saveBeforeDiscovery) : undefined}
      action={<>
        <Button size="sm" variant="outline" disabled={busy || dirty} onClick={async event => {
          const origin = event.currentTarget;
          const result = await run({ type: "discovery.start", providerId: current.id });
          if (result.ok) island.open({ id: `discover-${current.id}`, label: providersMessages.fetchModels, width: panelIslandWidth, origin,
            render: () => <ModelDiscoveryPicker providerId={current.id} /> });
        }}><Search />{i18n.text(providersMessages.fetchModels)}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={event => openModel(null, event.currentTarget)}><Plus />{i18n.formatMessage(providersMessages.addModel)}</Button>
      </>}>
      {models.length ? <ItemGroup className="surface">{models.map((model, index) => <div key={modelReference(model)}>{index > 0 && <ItemSeparator />}
        <ModelRow model={model} provider={current} selected={island.child === `model-${modelReference(model)}`} onOpen={origin => openModel(modelReference(model), origin)} />
      </div>)}</ItemGroup>
        : <Empty className="border md:p-6"><EmptyHeader><EmptyDescription>{i18n.formatMessage(providersMessages.emptyModels)}</EmptyDescription></EmptyHeader></Empty>}
    </EditorSection>}
  </Editor>;
}

function TestResult({ test }: { test: ConnectionTest }) {
  const i18n = useI18n();
  if (test.state === "running") return <StatusText tone="progress">{i18n.formatMessage(providersMessages.testing)}</StatusText>;
  if (test.state === "succeeded") return <StatusText tone="success">{i18n.formatMessage(providersMessages.testConnected)}{test.durationMs !== null && ` · ${test.durationMs} ms`}</StatusText>;
  return <StatusText tone="error">{test.error ? testHints()[test.error] : test.message}</StatusText>;
}

function ModelRow({ model, provider, selected, onOpen }: { model: ProviderModel; provider: Provider; selected: boolean; onOpen: (origin: HTMLElement) => void }) {
  const i18n = useI18n();
  const { snapshot, busy } = useSettingsConfiguration();
  const quick = useQuickActions();
  const test = snapshot ? latestTest(snapshot, modelReference(model)) : undefined;
  const running = test?.state === "running";
  return <ListRow title={model.name} selected={selected} disabled={busy} onOpen={onOpen}
    description={<><span className="font-mono">{model.modelId}</span>{test && <> · <TestResult test={test} /></>}</>}
    actions={<>
      <Button size="sm" variant="ghost" disabled={busy || (!running && (!model.enabled || !provider.enabled))} onClick={() => void quick.test(model)}>
        {running ? i18n.formatMessage(providersMessages.cancelTestRequest) : i18n.formatMessage(providersMessages.test)}</Button>
      <Switch aria-label={i18n.formatMessage(providersMessages.enableModel, { model_name: model.name })} checked={model.enabled} disabled={busy} onCheckedChange={next => void quick.setModelEnabled(model, next)} />
    </>} />;
}

/* ---------- 模型详情：基本信息、参数、兼容设置与连接测试分区，参数获取位于参数区块 ---------- */

function ModelEditor({ initialId, providerId }: { initialId: string | null; providerId: string }) {
  const i18n = useI18n();
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const quick = useQuickActions();
  const [id, setId] = useState(initialId);
  const current = snapshot?.models.find(model => modelReference(model) === id);
  const provider = snapshot?.providers.find(item => item.id === providerId);
  const [value, setValue] = useState<ProviderModel>(() => current ? modelValue(current) : createModelInput(providerId, { name: "", modelId: "" }));
  const set = <K extends keyof ProviderModel>(field: K, next: ProviderModel[K]) => setValue(previous => ({ ...previous, [field]: next }));
  // 与提供商一致：名称在前并生成 ID；手动改过 ID 或编辑已有模型时不再覆盖。
  const [idEdited, setIdEdited] = useState(!!current);
  const setName = (name: string) => setValue(previous => ({ ...previous, name, ...(idEdited ? {} : { modelId: slugify(name, { slash: true }) }) }));
  // enabled 为即时操作，比较与保存都取快照值。
  const dirty = useMemo(() => !current || JSON.stringify({ ...modelValue(current), enabled: 0 }) !== JSON.stringify({ ...value, enabled: 0 }), [current, value]);
  const test = current && snapshot ? latestTest(snapshot, modelReference(current)) : undefined;
  const users = current && snapshot ? snapshot.roles.filter(role => role.model === modelReference(current)) : [];
  const parameters = useModelParameters(current, dirty, updated => setValue(modelValue(updated)));

  return <Editor form="model-form" title={current?.name ?? i18n.formatMessage(providersMessages.newModel)} description={provider?.name} dirty={dirty}
    remove={current ? { title: i18n.formatMessage(providersMessages.deleteModelTitle),
      description: users.length
        ? i18n.formatMessage(providersMessages.deleteModelWithRolesDescription, { current_name: current.name, roles: users.map(role => role.id).join(", ") })
        : i18n.formatMessage(providersMessages.deleteUnusedModelDescription, { current_name: current.name }),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "model", id: modelReference(current) }); if (result.ok) void island.close({ force: true }); } } : undefined}>
    <form id="model-form" onSubmit={async event => {
      event.preventDefault();
      const result = await run({ type: "model.save", id, value: { ...value, enabled: current?.enabled ?? true } });
      if (result.ok) {
        const persisted = result.snapshot.models.find(item => modelReference(item) === result.savedId);
        if (persisted) setValue(modelValue(persisted));
        setId(result.savedId);
      }
    }}><fieldset disabled={parameters.pending} className="contents"><FieldGroup>
      <TextField label={i18n.formatMessage(providersMessages.modelDisplayName)} value={value.name} onChange={setName} required />
      <TextField label={i18n.formatMessage(providersMessages.serverModelId)} value={value.modelId} onChange={next => { setIdEdited(true); set("modelId", next); }} required hint={i18n.formatMessage(providersMessages.serverModelIdHint)} />
      {current && <Field><FieldLabel>{i18n.formatMessage(providersMessages.usedBy)}</FieldLabel>
        {users.length ? <ul className="flex flex-wrap gap-1.5" aria-label={i18n.formatMessage(providersMessages.rolesUsingModel)}>
          {users.map(role => <li key={role.id}><Badge variant="secondary">{role.id}</Badge></li>)}
        </ul> : <FieldDescription>{i18n.formatMessage(providersMessages.noRolesUsingModel)}</FieldDescription>}
      </Field>}
    </FieldGroup>
      <EditorSection collapsible title={i18n.formatMessage(providersMessages.parameters)} action={parameters.action}
        hint={<>{i18n.text(modelCatalogMessages.hint)}{dirty && <> {i18n.text(modelCatalogMessages.saveFirst)}</>}</>}
        status={parameters.feedback}>
        <FieldSet><FieldLegend variant="label">{i18n.formatMessage(providersMessages.capabilities)}</FieldLegend>
          <div className="surface">
            <FieldGroup className="gap-4 p-4">
              <Field orientation="horizontal">
                <FieldContent><FieldLabel htmlFor="capability-reasoning">{i18n.formatMessage(providersMessages.reasoning)}</FieldLabel></FieldContent>
                <Switch id="capability-reasoning" checked={value.capabilities.reasoning}
                  onCheckedChange={reasoning => set("capabilities", { ...value.capabilities, reasoning })} />
              </Field>
              {value.capabilities.reasoning && <FieldSet className="gap-3" aria-describedby="thinking-levels-description">
                <FieldLegend variant="label">{i18n.formatMessage(providersMessages.availableThinkingLevels)}</FieldLegend>
                <FieldDescription id="thinking-levels-description">{i18n.formatMessage(providersMessages.thinkingLevelsHint)}</FieldDescription>
                <FieldGroup className="grid grid-cols-3 gap-x-4 gap-y-3">
                  {thinkingSchema.options.map(level => <Field key={level} orientation="horizontal">
                    <Checkbox id={`thinking-${level}`} checked={value.capabilities.thinkingLevels.includes(level)}
                      onCheckedChange={checked => set("capabilities", { ...value.capabilities,
                        thinkingLevels: thinkingSchema.options.filter(item => item === level ? checked === true : value.capabilities.thinkingLevels.includes(item)) })} />
                    <FieldLabel htmlFor={`thinking-${level}`}>{i18n.text(thinkingLabels[level])}</FieldLabel>
                  </Field>)}
                </FieldGroup>
                {value.capabilities.thinkingLevels.length === 0 && <FieldDescription role="status">
                  {i18n.formatMessage(providersMessages.noThinkingLevels)}
                </FieldDescription>}
              </FieldSet>}
            </FieldGroup>
            <Separator />
            <FieldGroup className="p-4">
              <Field orientation="horizontal">
                <FieldContent><FieldLabel htmlFor="capability-tools">{i18n.formatMessage(providersMessages.toolCalls)}</FieldLabel></FieldContent>
                <Switch id="capability-tools" checked={value.capabilities.tools}
                  onCheckedChange={tools => set("capabilities", { ...value.capabilities, tools })} />
              </Field>
            </FieldGroup>
          </div>
        </FieldSet>
        <FieldGroup>
          <NumberField label={i18n.formatMessage(providersMessages.contextWindow)} value={value.contextWindow} onChange={next => set("contextWindow", next)} min={1} integer />
          <NumberField label={i18n.formatMessage(providersMessages.temperature)} value={value.generation.temperature} onChange={next => set("generation", { ...value.generation, temperature: next })} max={2} />
          <NumberField label="Top P" value={value.generation.topP} onChange={next => set("generation", { ...value.generation, topP: next })} max={1} />
          <NumberField label={i18n.formatMessage(providersMessages.maximumOutputTokens)} value={value.generation.maxOutputTokens} onChange={next => set("generation", { ...value.generation, maxOutputTokens: next })} min={1} integer />
        </FieldGroup>
      </EditorSection>
      <ModelCostEditor value={value.cost} onChange={next => set("cost", next)} />
      {provider && canEditProviderField(provider, "compatibility") && <ModelCompatibilityEditor value={value.compatibility} inherited={provider.compatibility} onChange={next => set("compatibility", next)} />}
      </fieldset>
    </form>
    {current && <EditorSection title={i18n.formatMessage(providersMessages.connectionTest)}
      hint={<>{i18n.formatMessage(providersMessages.testHint)}{dirty && <> {i18n.formatMessage(providersMessages.saveBeforeTest)}</>}</>}
      action={<Button size="sm" variant="outline" disabled={busy || (test?.state !== "running" && (!current.enabled || !provider?.enabled))} onClick={() => void quick.test(current)}>
        {test?.state === "running" ? <><Spinner data-icon="inline-start" />{i18n.formatMessage(providersMessages.cancelTest)}</> : <><PlugZap data-icon="inline-start" />{i18n.formatMessage(providersMessages.testConnection)}</>}</Button>}>
      {test && <div role="status" className="flex flex-col gap-1">
        <TestResult test={test} />
        {test.state === "failed" && test.message && <p className="type-caption break-words">{test.message}</p>}
      </div>}
    </EditorSection>}
  </Editor>;
}
