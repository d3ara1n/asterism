import { Plus, Zap, Search, ExternalLink, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { modelReference, thinkingSchema, type ConfigurationSnapshot, type ConnectionTest, type Provider, type ProviderInput, type ProviderModel, type TestError } from "../../../shared/configuration";
import { presetGroups, providerPresets, type ProviderPreset } from "../../../shared/provider-presets";
import { commonMessages } from "../../messages/common";
import { providersMessages } from "../../messages/providers";
import { thinkingLabels } from "../../messages/model-selection";
import { getI18n, useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Checkbox } from "../../shared/ui/checkbox";
import { FieldGroup, Field, FieldContent, FieldLabel, FieldDescription, FieldSet, FieldLegend } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { ItemGroup, ItemSeparator, Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions } from "../../shared/ui/item";
import { Separator } from "../../shared/ui/separator";
import { Spinner } from "../../shared/ui/spinner";
import { Switch } from "../../shared/ui/switch";
import { cn } from "../../shared/utils";
import { useIsland } from "../../shared/weave/Screen";
import { Section } from "../settings/layout";
import { Editor, TextField, ChoiceField, NumberField } from "./forms";
import { useSettingsConfiguration } from "./state";
import { ModelCompatibilityEditor } from "./ModelCompatibilityEditor";
import { modelProtocolLabels } from "./protocols";

const protocols = Object.entries(modelProtocolLabels).map(([value, label]) => ({ value, label }));
const protocolLabel = (value: string) => protocols.find(item => item.value === value)?.label ?? value;
const islandWidth = { min: 400, grow: 1, max: 620 };
type ModelValue = Omit<ProviderModel, "id" | "revision">;
type ProviderValue = Omit<ProviderInput, "enabled">;

/* ---------- 状态推导：列表与详情共用，均直接读取最新快照 ---------- */

type Tone = "ok" | "warn" | "off" | "idle";
interface Health { tone: Tone; label: string }
const latestTest = (snapshot: ConfigurationSnapshot, modelId: string): ConnectionTest | undefined =>
  snapshot.tests.filter(test => test.model === modelId).at(-1);
function providerHealth(snapshot: ConfigurationSnapshot, provider: Provider): Health {
  if (!provider.enabled) return { tone: "off", label: getI18n().formatMessage(providersMessages.disabled) };
  if (provider.auth === "api_key" && provider.credentialState !== "available") return { tone: "warn", label: getI18n().formatMessage(providersMessages.needsApiKey) };
  const models = snapshot.models.filter(model => model.providerId === provider.id);
  if (!models.length) return { tone: "idle", label: getI18n().formatMessage(providersMessages.noModels) };
  const tests = models.map(model => latestTest(snapshot, modelReference(model))).filter(test => test && test.providerRevision === provider.revision);
  if (tests.some(test => test!.state === "failed")) return { tone: "warn", label: getI18n().formatMessage(providersMessages.lastTestFailed) };
  if (tests.some(test => test!.state === "succeeded")) return { tone: "ok", label: getI18n().formatMessage(providersMessages.connected) };
  return { tone: "idle", label: getI18n().formatMessage(providersMessages.notTested) };
}
const dot: Record<Tone, string> = { ok: "bg-primary", warn: "bg-destructive", off: "bg-muted-foreground/40", idle: "bg-muted-foreground" };
function StatusBadge({ health }: { health: Health }) {

  return <Badge variant="outline" className="font-normal text-muted-foreground"><span aria-hidden="true" className={`size-1.5 rounded-full ${dot[health.tone]}`} />{health.label}</Badge>;
}
const credentialLabels = (): Record<Provider["credentialState"], string> => ({
  not_required: getI18n().formatMessage(providersMessages.noAuthentication), missing: getI18n().formatMessage(providersMessages.noKeySaved), available: getI18n().formatMessage(providersMessages.keySaved),
  storage_unavailable: getI18n().formatMessage(providersMessages.credentialProtectionUnavailable), decryption_failed: getI18n().formatMessage(providersMessages.decryptionFailed),
});
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
});
const modelValue = (model: ProviderModel): ModelValue => ({
  providerId: model.providerId, name: model.name, modelId: model.modelId, enabled: model.enabled, contextWindow: model.contextWindow,
  capabilities: { ...model.capabilities }, generation: { ...model.generation }, compatibility: structuredClone(model.compatibility),
});

/* ---------- 根：提供商总览 ---------- */

export function ProvidersSettings() {
  const i18n = useI18n();
  const { snapshot, busy } = useSettingsConfiguration();
  const island = useIsland();
  const quick = useQuickActions();
  const open = (id: string | null, origin?: HTMLElement | null) => island.open({ id: `provider-${id ?? "new"}`, label: providersMessages.provider, width: islandWidth, origin,
    render: () => <ProviderEditor key={id ?? "new"} initialId={id} /> });
  const providers = snapshot?.providers ?? [];
  return <Section title={i18n.formatMessage(providersMessages.connections)} hint={i18n.formatMessage(providersMessages.summary)}
    action={<Button size="sm" disabled={!snapshot} onClick={event => open(null, event.currentTarget)}><Plus />{i18n.formatMessage(providersMessages.addProvider)}</Button>}>
    {snapshot && !providers.length ? <div className="surface flex flex-col items-center gap-3 px-6 py-10 text-center">
      <Zap className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="type-body">{i18n.formatMessage(providersMessages.emptyConnections)}</p>
      <Button size="sm" variant="outline" onClick={event => open(null, event.currentTarget)}><Plus />{i18n.formatMessage(providersMessages.addFirstProvider)}</Button>
    </div> : snapshot && <ItemGroup className="surface">{providers.map((provider, index) => {
      const count = snapshot.models.filter(model => model.providerId === provider.id).length;
      const selected = island.child === `provider-${provider.id}`;
      return <div key={provider.id}>{index > 0 && <ItemSeparator />}<Item size="sm" className={cn("relative transition-colors hover:bg-accent/60 has-[button:focus-visible]:bg-accent/60", selected && "bg-accent hover:bg-accent")}>
        <ItemMedia><Monogram name={provider.name} /></ItemMedia>
        <ItemContent className="min-w-0">
          <button type="button" className="text-left outline-none after:absolute after:inset-0 focus-visible:underline" aria-current={selected || undefined}
            onClick={event => open(provider.id, event.currentTarget)}><ItemTitle>{provider.name}</ItemTitle></button>
          <ItemDescription className="truncate">{protocolLabel(provider.protocol)} · {i18n.formatMessage(providersMessages.modelCount, { count: count })}</ItemDescription>
        </ItemContent>
        <ItemActions className="relative">
          <StatusBadge health={providerHealth(snapshot, provider)} />
          <Switch aria-label={i18n.formatMessage(providersMessages.enableProvider, { provider_name: provider.name })} checked={provider.enabled} disabled={busy}
            onCheckedChange={next => void quick.setProviderEnabled(provider, next)} />
        </ItemActions>
      </Item></div>;
    })}</ItemGroup>}
  </Section>;
}

function Monogram({ name }: { name: string }) {

  return <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-sm font-medium text-muted-foreground">
    {name.trim().charAt(0).toUpperCase() || "?"}</span>;
}

/* ---------- 预设选择：自适应网格，数量增长后自动出现分组与搜索 ---------- */

const groupLabels = (): Record<ProviderPreset["group"], string> => ({ official: getI18n().formatMessage(providersMessages.official), aggregator: getI18n().formatMessage(providersMessages.aggregators), local: getI18n().formatMessage(providersMessages.local) });
const searchThreshold = 8;
function PresetPicker({ onPick }: { onPick: (preset: ProviderPreset | null) => void }) {
  const i18n = useI18n();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = providerPresets.filter(preset => !q || [preset.name, preset.id, ...(preset.keywords ?? [])].some(word => word.toLowerCase().includes(q)));
  const groups = presetGroups.map(group => ({ group, items: matches.filter(preset => preset.group === group) })).filter(entry => entry.items.length);
  const titled = new Set(providerPresets.map(preset => preset.group)).size > 1;
  const tile = "flex h-16 flex-col items-start justify-center gap-0.5 rounded-lg border px-3 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50";
  return <div className="flex flex-col gap-5">
    <p className="type-caption">{i18n.formatMessage(providersMessages.presetHint)}</p>
    {providerPresets.length > searchThreshold && <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input autoFocus className="pl-8" placeholder={i18n.formatMessage(providersMessages.searchProviders)} aria-label={i18n.formatMessage(providersMessages.searchProvidersLabel)} value={query} onChange={event => setQuery(event.target.value)} />
    </div>}
    {groups.map(({ group, items }) => <section key={group} aria-label={groupLabels()[group]}>
      {titled && <h3 className="type-label mb-2">{groupLabels()[group]}</h3>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))" }}>
        {items.map(preset => <button key={preset.id} type="button" className={`${tile} bg-card`} onClick={() => onPick(preset)}>
          <span className="type-section truncate">{preset.name}</span>
          <span className="type-caption truncate">{preset.auth === "none" ? i18n.formatMessage(providersMessages.noKeyNeeded) : i18n.text(commonMessages.apiKey)}</span>
        </button>)}
      </div>
    </section>)}
    {q && !groups.length && <p className="type-caption">{i18n.formatMessage(providersMessages.noMatchingProvider)}</p>}
    <button type="button" className={`${tile} border-dashed`} onClick={() => onPick(null)}>
      <span className="type-section">{i18n.formatMessage(providersMessages.customConnection)}</span>
      <span className="type-caption">{i18n.formatMessage(providersMessages.customConnectionHint)}</span>
    </button>
  </div>;
}

/* ---------- 提供商详情 ---------- */

type KeyAction = "keep" | "replace" | "clear";
/** 由显示名称规范化出 ID：小写、空白转连字符、去掉不允许的字符；模型 ID 允许 `/`。 */
export function slugify(name: string, options: { slash?: boolean } = {}): string {
  const allowed = options.slash ? /[^\p{L}\p{N}._\/-]/gu : /[^\p{L}\p{N}._-]/gu;
  return name.trim().toLowerCase().replace(/\s+/gu, "-").replace(allowed, "").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
}
const blank: ProviderValue = { id: "", name: "", protocol: "openai-responses", baseUrl: "https://api.openai.com/v1", auth: "api_key", compatibility: [] };

function ProviderEditor({ initialId }: { initialId: string | null }) {
  const i18n = useI18n();
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const [picking, setPicking] = useState(initialId === null);
  const [preset, setPreset] = useState<ProviderPreset | null>(null);
  const current = snapshot?.providers.find(item => item.id === id);
  // 草稿不含 enabled：启用是即时操作，始终取快照，避免与上级浮岛的开关互相覆盖。
  const [value, setValue] = useState<ProviderValue>(() => current ? providerValue(current) : blank);
  const [keyAction, setKeyAction] = useState<KeyAction>(current ? "keep" : "replace");
  const [key, setKey] = useState("");
  const set = <K extends keyof typeof value>(field: K, next: (typeof value)[K]) => setValue(previous => ({ ...previous, [field]: next }));
  // 新建时 ID 跟随显示名称生成；用户手动改过 ID 后不再跟随。
  const [idEdited, setIdEdited] = useState(!!current);
  const setName = (name: string) => setValue(previous => ({ ...previous, name, ...(idEdited ? {} : { id: slugify(name) }) }));

  const saved = current ? providerValue(current) : null;
  const credentialChanged = value.auth === "api_key" && (keyAction === "clear" || (keyAction === "replace" && key.trim() !== ""));
  const dirty = !saved || JSON.stringify(saved) !== JSON.stringify(value) || credentialChanged;

  if (picking) return <Editor form="provider-form" title={i18n.formatMessage(providersMessages.confirmAddProvider)} dirty={false}>
    <PresetPicker onPick={picked => {
      setPreset(picked);
      setValue(picked ? { id: picked.id, name: picked.name, protocol: picked.protocol, baseUrl: picked.baseUrl, auth: picked.auth, compatibility: [] } : { ...blank });
      setPicking(false);
    }} />
  </Editor>;

  const openModel = (modelId: string | null, origin?: HTMLElement | null) => {
    if (id) island.open({ id: `model-${modelId ?? "new"}`, label: providersMessages.model, width: islandWidth, origin,
      render: () => <ModelEditor key={modelId ?? "new"} initialId={modelId} providerId={id} /> });
  };
  const models = snapshot?.models.filter(model => model.providerId === id) ?? [];
  const storedKey = current?.credentialState === "available";

  return <Editor form="provider-form" title={current?.name ?? i18n.formatMessage(providersMessages.newProvider)} dirty={dirty}
    description={current ? protocolLabel(current.protocol) : preset?.name ?? i18n.formatMessage(providersMessages.customProvider)}
    remove={current ? { title: i18n.formatMessage(providersMessages.deleteProviderTitle),
      description: i18n.formatMessage(providersMessages.deleteProviderDescription, { current_name: current.name, models_length: models.length }),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "provider", id: current.id }); if (result.ok) void island.close({ force: true }); } } : undefined}>
    {!current && <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => setPicking(true)}>{i18n.formatMessage(providersMessages.changePreset)}</Button>}
    <form id="provider-form" onSubmit={async event => {
      event.preventDefault();
      const result = await run({ type: "provider.save", id, value: { ...value, enabled: current?.enabled ?? true },
        credential: value.auth === "none" || keyAction === "clear" ? { action: "clear" } : keyAction === "replace" && key.trim() ? { action: "replace", value: key } : { action: "keep" } });
      if (result.ok) {
        const persisted = result.snapshot.providers.find(item => item.id === result.savedId);
        if (persisted) setValue(providerValue(persisted));
        setId(result.savedId);
        setKey("");
        setKeyAction("keep");
      }
    }}>
      <h3 className="type-section mb-3">{i18n.formatMessage(providersMessages.connection)}</h3>
      <FieldGroup>
        <TextField label={i18n.formatMessage(providersMessages.displayName)} value={value.name} onChange={setName} required />
        <TextField label={i18n.formatMessage(providersMessages.providerId)} value={value.id} onChange={next => { setIdEdited(true); set("id", next); }} required hint={i18n.formatMessage(providersMessages.providerIdHint)} />
        <ChoiceField label={i18n.formatMessage(providersMessages.protocol)} value={value.protocol} options={protocols} onChange={next => next && set("protocol", next as ProviderInput["protocol"])} />
        <TextField label={i18n.text(commonMessages.baseUrl)} value={value.baseUrl} onChange={next => set("baseUrl", next)} required
          hint={value.auth === "api_key" ? i18n.formatMessage(providersMessages.httpsRequired) : undefined} />
        <ChoiceField label={i18n.formatMessage(providersMessages.authentication)} value={value.auth} options={[{ value: "api_key", label: i18n.text(commonMessages.apiKey) }, { value: "none", label: i18n.formatMessage(providersMessages.noAuthenticationOption) }]}
          onChange={next => next && set("auth", next as ProviderInput["auth"])} />
        {value.auth === "api_key" && <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="provider-api-key">{i18n.text(commonMessages.apiKey)}</FieldLabel>
            {preset?.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="type-caption inline-flex items-center gap-1 hover:text-foreground">
              {i18n.formatMessage(providersMessages.getKey)}<ExternalLink className="size-3" aria-hidden="true" /></a>}
          </div>
          <Input id="provider-api-key" type="password" autoComplete="off" autoFocus={!current} value={key} disabled={keyAction === "clear"}
            onChange={event => { setKey(event.target.value); setKeyAction("replace"); }}
            placeholder={storedKey ? i18n.formatMessage(providersMessages.keepSavedKey) : i18n.formatMessage(providersMessages.pasteApiKey)} />
          <FieldDescription className={keyAction === "clear" || (current && !storedKey && current.credentialState !== "missing") ? "text-destructive" : undefined}>
            {keyAction === "clear" ? i18n.formatMessage(providersMessages.keyRemovalHint) : current ? credentialLabels()[current.credentialState] : i18n.formatMessage(providersMessages.keyStorageHint)}
            {storedKey && <Button type="button" variant="link" size="sm" className="ml-1 h-auto p-0 text-xs"
              onClick={() => { setKey(""); setKeyAction(keyAction === "clear" ? "keep" : "clear"); }}>{keyAction === "clear" ? i18n.formatMessage(providersMessages.undo) : i18n.formatMessage(providersMessages.removeSavedKey)}</Button>}
          </FieldDescription>
          {!snapshot?.credentialStorageAvailable && <p className="text-xs text-destructive">{i18n.formatMessage(providersMessages.encryptionUnavailable)}</p>}
        </Field>}
      </FieldGroup>
      <ModelCompatibilityEditor value={value.compatibility} onChange={next => set("compatibility", next)} />
    </form>

    {current && snapshot && <section className="mt-8 border-t pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="type-section">{i18n.formatMessage(providersMessages.models)}</h3>
        {/* 模型发现尚未接入，入口待 plans/todo-2026-10-07-model-catalog.md 落地后加在此处。 */}
        <Button size="sm" variant="outline" disabled={busy} onClick={event => openModel(null, event.currentTarget)}><Plus />{i18n.formatMessage(providersMessages.addModel)}</Button>
      </div>
      {models.length ? <ItemGroup className="surface">{models.map((model, index) => <div key={modelReference(model)}>{index > 0 && <ItemSeparator />}
        <ModelRow model={model} provider={current} selected={island.child === `model-${modelReference(model)}`} onOpen={origin => openModel(modelReference(model), origin)} />
      </div>)}</ItemGroup>
        : <p className="type-caption rounded-md border border-dashed px-3 py-4 text-center">{i18n.formatMessage(providersMessages.emptyModels)}</p>}
    </section>}
  </Editor>;
}

function TestResult({ test, stale }: { test: ConnectionTest; stale: boolean }) {
  const i18n = useI18n();
  if (test.state === "running") return <span className="type-caption inline-flex items-center gap-1"><Spinner className="size-3" />{i18n.formatMessage(providersMessages.testing)}</span>;
  if (stale) return <span className="type-caption">{i18n.formatMessage(providersMessages.settingsChanged)}</span>;
  if (test.state === "succeeded") return <span className="type-caption">{i18n.formatMessage(providersMessages.testConnected)}{test.durationMs !== null && ` · ${test.durationMs} ms`}</span>;
  return <span className="type-caption text-destructive">{test.error ? testHints()[test.error] : test.message}</span>;
}

function ModelRow({ model, provider, selected, onOpen }: { model: ProviderModel; provider: Provider; selected: boolean; onOpen: (origin: HTMLElement) => void }) {
  const i18n = useI18n();
  const { snapshot, busy } = useSettingsConfiguration();
  const quick = useQuickActions();
  const test = snapshot ? latestTest(snapshot, modelReference(model)) : undefined;
  const stale = !!test && (test.modelRevision !== model.revision || test.providerRevision !== provider.revision);
  const running = test?.state === "running";
  return <Item size="sm" className={cn("relative transition-colors hover:bg-accent/60 has-[button:focus-visible]:bg-accent/60", selected && "bg-accent hover:bg-accent")}>
    <ItemContent className="min-w-0">
      <button type="button" className="text-left outline-none after:absolute after:inset-0 focus-visible:underline" aria-current={selected || undefined}
        onClick={event => onOpen(event.currentTarget)}><ItemTitle>{model.name}</ItemTitle></button>
      <ItemDescription className="truncate"><span className="font-mono">{model.modelId}</span>{test && <> · <TestResult test={test} stale={stale} /></>}</ItemDescription>
    </ItemContent>
    <ItemActions className="relative">
      <Button size="sm" variant="ghost" disabled={busy || (!running && (!model.enabled || !provider.enabled))} onClick={() => void quick.test(model)}>
        {running ? i18n.formatMessage(providersMessages.cancelTestRequest) : i18n.formatMessage(providersMessages.test)}</Button>
      <Switch aria-label={i18n.formatMessage(providersMessages.enableModel, { model_name: model.name })} checked={model.enabled} disabled={busy} onCheckedChange={next => void quick.setModelEnabled(model, next)} />
    </ItemActions>
  </Item>;
}

/* ---------- 模型详情：常用字段在前，参数收进高级 ---------- */

function ModelEditor({ initialId, providerId }: { initialId: string | null; providerId: string }) {
  const i18n = useI18n();
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const quick = useQuickActions();
  const [id, setId] = useState(initialId);
  const current = snapshot?.models.find(model => modelReference(model) === id);
  const provider = snapshot?.providers.find(item => item.id === providerId);
  const [value, setValue] = useState<ModelValue>(() => current ? modelValue(current) : {
    providerId, name: "", modelId: "", enabled: true, contextWindow: null, compatibility: [],
    capabilities: { reasoning: false, tools: true, thinkingLevels: [...thinkingSchema.options] }, generation: { temperature: null, topP: null, maxOutputTokens: null } });
  const [advanced, setAdvanced] = useState(false);
  const set = <K extends keyof ModelValue>(field: K, next: ModelValue[K]) => setValue(previous => ({ ...previous, [field]: next }));
  // 与提供商一致：名称在前并生成 ID；手动改过 ID 或编辑已有模型时不再覆盖。
  const [idEdited, setIdEdited] = useState(!!current);
  const setName = (name: string) => setValue(previous => ({ ...previous, name, ...(idEdited ? {} : { modelId: slugify(name, { slash: true }) }) }));
  // enabled 为即时操作，比较与保存都取快照值。
  const dirty = useMemo(() => !current || JSON.stringify({ ...modelValue(current), enabled: 0 }) !== JSON.stringify({ ...value, enabled: 0 }), [current, value]);
  const test = current && snapshot ? latestTest(snapshot, modelReference(current)) : undefined;
  const stale = !!test && !!current && (test.modelRevision !== current.revision || test.providerRevision !== provider?.revision);
  const users = current && snapshot ? snapshot.roles.filter(role => role.model === modelReference(current)) : [];

  return <Editor form="model-form" title={current?.name ?? i18n.formatMessage(providersMessages.newModel)} description={provider?.name} dirty={dirty}
    remove={current ? { title: i18n.formatMessage(providersMessages.deleteModelTitle),
      description: users.length
        ? i18n.formatMessage(providersMessages.deleteModelWithRolesDescription, { current_name: current.name, roles: users.map(role => role.name).join(", ") })
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
    }}><FieldGroup>
      <TextField label={i18n.formatMessage(providersMessages.modelDisplayName)} value={value.name} onChange={setName} required />
      <TextField label={i18n.formatMessage(providersMessages.serverModelId)} value={value.modelId} onChange={next => { setIdEdited(true); set("modelId", next); }} required hint={i18n.formatMessage(providersMessages.serverModelIdHint)} />
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
      {current && <Field><FieldLabel>{i18n.formatMessage(providersMessages.usedBy)}</FieldLabel>
        {users.length ? <ul className="flex flex-wrap gap-1.5" aria-label={i18n.formatMessage(providersMessages.rolesUsingModel)}>
          {users.map(role => <li key={role.id}><Badge variant="secondary">{role.name}</Badge></li>)}
        </ul> : <FieldDescription>{i18n.formatMessage(providersMessages.noRolesUsingModel)}</FieldDescription>}
      </Field>}
    </FieldGroup>
      <Button type="button" variant="ghost" size="sm" className="-ml-2 mt-5" aria-expanded={advanced} onClick={() => setAdvanced(open => !open)}>
        <ChevronDown className={advanced ? "rotate-180 transition-transform" : "transition-transform"} />{i18n.formatMessage(providersMessages.advanced)}</Button>
      {advanced && <FieldGroup className="mt-3">
        <NumberField label={i18n.formatMessage(providersMessages.contextWindow)} value={value.contextWindow} onChange={next => set("contextWindow", next)} min={1} integer />
        <NumberField label={i18n.formatMessage(providersMessages.temperature)} value={value.generation.temperature} onChange={next => set("generation", { ...value.generation, temperature: next })} max={2} />
        <NumberField label="Top P" value={value.generation.topP} onChange={next => set("generation", { ...value.generation, topP: next })} max={1} />
        <NumberField label={i18n.formatMessage(providersMessages.maximumOutputTokens)} value={value.generation.maxOutputTokens} onChange={next => set("generation", { ...value.generation, maxOutputTokens: next })} min={1} integer />
      </FieldGroup>}
      <ModelCompatibilityEditor value={value.compatibility} inherited={provider?.compatibility ?? []} onChange={next => set("compatibility", next)} />
    </form>
    {current && <section className="mt-7 border-t pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-section">{i18n.formatMessage(providersMessages.connectionTest)}</h3>
        <Button size="sm" variant="secondary" disabled={busy || (test?.state !== "running" && (!current.enabled || !provider?.enabled))} onClick={() => void quick.test(current)}>
          {test?.state === "running" ? i18n.formatMessage(providersMessages.cancelTest) : i18n.formatMessage(providersMessages.testConnection)}</Button>
      </div>
      <p className="type-caption mt-1">{i18n.formatMessage(providersMessages.testHint)}</p>
      {test && <div role="status" className="mt-3 rounded-md border px-3 py-2">
        <TestResult test={test} stale={stale} />
        {test.state === "failed" && test.message && !stale && <p className="type-caption mt-1 break-words">{test.message}</p>}
      </div>}
      {dirty && <p className="type-caption mt-2">{i18n.formatMessage(providersMessages.saveBeforeTest)}</p>}
    </section>}
  </Editor>;
}
