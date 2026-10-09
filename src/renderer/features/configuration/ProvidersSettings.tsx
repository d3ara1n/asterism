import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Plus, Search, Zap } from "lucide-react";
import type { ConfigurationSnapshot, ConnectionTest, Provider, ProviderInput, ProviderModel, TestError } from "../../../shared/configuration";
import { presetGroups, providerPresets, type ProviderPreset } from "../../../shared/provider-presets";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "../../shared/ui/item";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { Switch } from "../../shared/ui/switch";
import { Spinner } from "../../shared/ui/spinner";
import { Checkbox } from "../../shared/ui/checkbox";
import { useIsland } from "../../shared/weave/Screen";
import { cn } from "../../shared/utils";
import { Section } from "../settings/preview";
import { ChoiceField, Editor, NumberField, TextField } from "./forms";
import { s, useSettingsConfiguration } from "./state";

const protocols = [
  { value: "openai-responses", label: "OpenAI Responses" }, { value: "openai-chat", label: "OpenAI Chat Completions" },
  { value: "anthropic", label: "Anthropic Messages" },
];
const protocolLabel = (value: string) => protocols.find(item => item.value === value)?.label ?? value;
const islandWidth = { min: 400, grow: 1, max: 620 };
type ModelValue = Omit<ProviderModel, "id" | "revision">;

/* ---------- 状态推导：列表与详情共用，均直接读取最新快照 ---------- */

type Tone = "ok" | "warn" | "off" | "idle";
interface Health { tone: Tone; label: string }
const latestTest = (snapshot: ConfigurationSnapshot, modelId: string): ConnectionTest | undefined =>
  snapshot.tests.filter(test => test.modelId === modelId).at(-1);
function providerHealth(snapshot: ConfigurationSnapshot, provider: Provider): Health {
  if (!provider.enabled) return { tone: "off", label: s("Disabled", "已停用") };
  if (provider.auth === "api_key" && provider.credentialState !== "available") return { tone: "warn", label: s("Needs API key", "缺少密钥") };
  const models = snapshot.models.filter(model => model.providerId === provider.id);
  if (!models.length) return { tone: "idle", label: s("No models", "未添加模型") };
  const tests = models.map(model => latestTest(snapshot, model.id)).filter(test => test && test.providerRevision === provider.revision);
  if (tests.some(test => test!.state === "failed")) return { tone: "warn", label: s("Last test failed", "最近测试失败") };
  if (tests.some(test => test!.state === "succeeded")) return { tone: "ok", label: s("Connected", "连接正常") };
  return { tone: "idle", label: s("Not tested", "未测试") };
}
const dot: Record<Tone, string> = { ok: "bg-primary", warn: "bg-destructive", off: "bg-muted-foreground/40", idle: "bg-muted-foreground" };
function StatusBadge({ health }: { health: Health }) {
  return <Badge variant="outline" className="font-normal text-muted-foreground"><span aria-hidden="true" className={`size-1.5 rounded-full ${dot[health.tone]}`} />{health.label}</Badge>;
}
const credentialLabels = (): Record<Provider["credentialState"], string> => ({
  not_required: s("No authentication", "无需鉴权"), missing: s("No key saved", "未保存密钥"), available: s("Saved securely", "已加密保存"),
  storage_unavailable: s("System credential protection is unavailable", "系统凭据保护不可用"), decryption_failed: s("Decryption failed, enter it again", "解密失败，请重新输入"),
});
/** 按错误类别给出下一步；原始信息仍随结果展示。 */
const testHints = (): Record<TestError, string> => ({
  configuration: s("Check the provider and model settings.", "检查提供商与模型配置。"),
  credential: s("Save an API key for this provider.", "为此提供商保存 API key。"),
  authentication: s("The key was rejected. Replace it in the provider connection.", "密钥被拒绝，请在提供商连接中替换。"),
  model_unavailable: s("Check the server model ID, or whether your account can access it.", "核对服务端模型 ID，或确认账户有权访问。"),
  rate_limit: s("Rate limited or out of quota. Try again later.", "触发限流或额度不足，请稍后再试。"),
  network: s("Can't reach the server. Check the Base URL and your network or proxy.", "无法连接服务器，检查 Base URL 与网络或代理。"),
  timeout: s("The server took too long. Try again.", "服务器响应超时，请重试。"),
  protocol: s("Unexpected response. Check that the protocol matches the service.", "响应格式不符，确认协议与服务一致。"),
  server: s("The provider returned a server error. Try again later.", "提供商服务出错，请稍后再试。"),
  cancelled: s("Test cancelled.", "测试已取消。"),
});

/* ---------- 即时操作：与编辑草稿分离，任何浮岛中触发都写回同一快照 ---------- */

function useQuickActions() {
  const { snapshot, run } = useSettingsConfiguration();
  return {
    setProviderEnabled: (provider: Provider, enabled: boolean) => run({ type: "provider.save", id: provider.id, credential: { action: "keep" },
      value: { name: provider.name, protocol: provider.protocol, baseUrl: provider.baseUrl, auth: provider.auth, enabled } }),
    setModelEnabled: (model: ProviderModel, enabled: boolean) => run({ type: "model.save", id: model.id, value: { ...modelValue(model), enabled } }),
    test: (model: ProviderModel) => {
      const running = snapshot && latestTest(snapshot, model.id);
      return running?.state === "running" ? run({ type: "test.cancel", id: running.id }) : run({ type: "test.start", modelId: model.id });
    },
  };
}
const modelValue = (model: ProviderModel): ModelValue => ({
  providerId: model.providerId, name: model.name, modelId: model.modelId, enabled: model.enabled, contextWindow: model.contextWindow,
  capabilities: { ...model.capabilities }, generation: { ...model.generation },
});

/* ---------- 根：提供商总览 ---------- */

export function ProvidersSettings() {
  const { snapshot, busy } = useSettingsConfiguration();
  const island = useIsland();
  const quick = useQuickActions();
  const open = (id: string | null, origin?: HTMLElement | null) => island.open({ id: `provider-${id ?? "new"}`, label: s("Provider", "提供商"), width: islandWidth, origin,
    render: () => <ProviderEditor key={id ?? "new"} initialId={id} /> });
  const providers = snapshot?.providers ?? [];
  return <Section title={s("Connections", "连接")} hint={s("Connections, credentials, and the models they provide.", "管理连接、凭据及其提供的具体模型。")}
    action={<Button size="sm" disabled={!snapshot} onClick={event => open(null, event.currentTarget)}><Plus />{s("Add provider", "添加提供商")}</Button>}>
    {snapshot && !providers.length ? <div className="surface flex flex-col items-center gap-3 px-6 py-10 text-center">
      <Zap className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="type-body">{s("Add a connection to start using models.", "添加连接后即可开始使用模型。")}</p>
      <Button size="sm" variant="outline" onClick={event => open(null, event.currentTarget)}><Plus />{s("Add provider", "添加提供商")}</Button>
    </div> : snapshot && <ItemGroup className="surface">{providers.map((provider, index) => {
      const count = snapshot.models.filter(model => model.providerId === provider.id).length;
      const selected = island.child === `provider-${provider.id}`;
      return <div key={provider.id}>{index > 0 && <ItemSeparator />}<Item size="sm" className={cn("relative transition-colors hover:bg-accent/60 has-[button:focus-visible]:bg-accent/60", selected && "bg-accent hover:bg-accent")}>
        <ItemMedia><Monogram name={provider.name} /></ItemMedia>
        <ItemContent className="min-w-0">
          <button type="button" className="text-left outline-none after:absolute after:inset-0 focus-visible:underline" aria-current={selected || undefined}
            onClick={event => open(provider.id, event.currentTarget)}><ItemTitle>{provider.name}</ItemTitle></button>
          <ItemDescription className="truncate">{protocolLabel(provider.protocol)} · {s(`${count} models`, `${count} 个模型`)}</ItemDescription>
        </ItemContent>
        <ItemActions className="relative">
          <StatusBadge health={providerHealth(snapshot, provider)} />
          <Switch aria-label={s(`Enable ${provider.name}`, `启用 ${provider.name}`)} checked={provider.enabled} disabled={busy}
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

const groupLabels = (): Record<ProviderPreset["group"], string> => ({ official: s("Official", "官方"), aggregator: s("Aggregators", "聚合服务"), local: s("Local", "本地") });
const searchThreshold = 8;
function PresetPicker({ onPick }: { onPick: (preset: ProviderPreset | null) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = providerPresets.filter(preset => !q || [preset.name, preset.id, ...(preset.keywords ?? [])].some(word => word.toLowerCase().includes(q)));
  const groups = presetGroups.map(group => ({ group, items: matches.filter(preset => preset.group === group) })).filter(entry => entry.items.length);
  const titled = new Set(providerPresets.map(preset => preset.group)).size > 1;
  const tile = "flex h-16 flex-col items-start justify-center gap-0.5 rounded-lg border px-3 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50";
  return <div className="flex flex-col gap-5">
    <p className="type-caption">{s("Pick a service to prefill its connection. You can change everything afterwards.", "选择服务以预填连接信息，之后仍可修改。")}</p>
    {providerPresets.length > searchThreshold && <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input autoFocus className="pl-8" placeholder={s("Search providers", "搜索提供商")} aria-label={s("Search providers", "搜索提供商")} value={query} onChange={event => setQuery(event.target.value)} />
    </div>}
    {groups.map(({ group, items }) => <section key={group} aria-label={groupLabels()[group]}>
      {titled && <h3 className="type-label mb-2">{groupLabels()[group]}</h3>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))" }}>
        {items.map(preset => <button key={preset.id} type="button" className={`${tile} bg-card`} onClick={() => onPick(preset)}>
          <span className="type-section truncate">{preset.name}</span>
          <span className="type-caption truncate">{preset.auth === "none" ? s("No key needed", "无需密钥") : "API key"}</span>
        </button>)}
      </div>
    </section>)}
    {q && !groups.length && <p className="type-caption">{s("No matching provider.", "没有匹配的提供商。")}</p>}
    <button type="button" className={`${tile} border-dashed`} onClick={() => onPick(null)}>
      <span className="type-section">{s("Custom connection", "自定义连接")}</span>
      <span className="type-caption">{s("Any compatible endpoint, relay, or local server", "任意兼容端点、中转或本地服务")}</span>
    </button>
  </div>;
}

/* ---------- 提供商详情 ---------- */

type KeyAction = "keep" | "replace" | "clear";
const blank: ProviderInput = { name: "", protocol: "openai-responses", baseUrl: "https://api.openai.com/v1", enabled: true, auth: "api_key" };

function ProviderEditor({ initialId }: { initialId: string | null }) {
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const [picking, setPicking] = useState(initialId === null);
  const [preset, setPreset] = useState<ProviderPreset | null>(null);
  const current = snapshot?.providers.find(item => item.id === id);
  // 草稿不含 enabled：启用是即时操作，始终取快照，避免与上级浮岛的开关互相覆盖。
  const fromCurrent = (provider: Provider): Omit<ProviderInput, "enabled"> => ({ name: provider.name, protocol: provider.protocol, baseUrl: provider.baseUrl, auth: provider.auth });
  const [value, setValue] = useState<Omit<ProviderInput, "enabled">>(() => current ? fromCurrent(current) : blank);
  const [keyAction, setKeyAction] = useState<KeyAction>(current ? "keep" : "replace");
  const [key, setKey] = useState("");
  const set = <K extends keyof typeof value>(field: K, next: (typeof value)[K]) => setValue(previous => ({ ...previous, [field]: next }));

  const saved = current ? fromCurrent(current) : null;
  const credentialChanged = value.auth === "api_key" && (keyAction === "clear" || (keyAction === "replace" && key.trim() !== ""));
  const dirty = !saved || JSON.stringify(saved) !== JSON.stringify(value) || credentialChanged;

  if (picking) return <Editor form="provider-form" title={s("Add provider", "添加提供商")} dirty={false}>
    <PresetPicker onPick={picked => {
      setPreset(picked);
      setValue(picked ? { name: picked.name, protocol: picked.protocol, baseUrl: picked.baseUrl, auth: picked.auth } : { ...blank, name: "" });
      setPicking(false);
    }} />
  </Editor>;

  const openModel = (modelId: string | null, origin?: HTMLElement | null) => {
    if (id) island.open({ id: `model-${modelId ?? "new"}`, label: s("Model", "模型"), width: islandWidth, origin,
      render: () => <ModelEditor key={modelId ?? "new"} initialId={modelId} providerId={id} /> });
  };
  const models = snapshot?.models.filter(model => model.providerId === id) ?? [];
  const storedKey = current?.credentialState === "available";

  return <Editor form="provider-form" title={current?.name ?? s("New provider", "新提供商")} dirty={dirty}
    description={current ? protocolLabel(current.protocol) : preset?.name ?? s("Custom connection", "自定义连接")}
    remove={current ? { title: s("Delete this provider?", "删除此提供商？"),
      description: s(`“${current.name}” and its ${models.length} models will be removed, including the saved key.`, `将移除「${current.name}」及其 ${models.length} 个模型，已保存的密钥一并删除。`),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "provider", id: current.id }); if (result.ok) void island.close({ force: true }); } } : undefined}>
    {!current && <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => setPicking(true)}>{s("Change preset", "更换预设")}</Button>}
    <form id="provider-form" onSubmit={async event => {
      event.preventDefault();
      const result = await run({ type: "provider.save", id, value: { ...value, enabled: current?.enabled ?? true },
        credential: value.auth === "none" || keyAction === "clear" ? { action: "clear" } : keyAction === "replace" && key.trim() ? { action: "replace", value: key } : { action: "keep" } });
      if (result.ok) { setId(result.savedId); setKey(""); setKeyAction("keep"); }
    }}>
      <h3 className="type-section mb-3">{s("Connection", "连接")}</h3>
      <FieldGroup>
        <TextField label={s("Name", "名称")} value={value.name} onChange={next => set("name", next)} required />
        <ChoiceField label={s("Protocol", "协议")} value={value.protocol} options={protocols} onChange={next => next && set("protocol", next as ProviderInput["protocol"])} />
        <TextField label="Base URL" value={value.baseUrl} onChange={next => set("baseUrl", next)} required
          hint={value.auth === "api_key" ? s("API keys require HTTPS, except on localhost or a loopback address.", "使用 API key 时需 HTTPS，本机回环地址除外。") : undefined} />
        <ChoiceField label={s("Authentication", "鉴权")} value={value.auth} options={[{ value: "api_key", label: "API key" }, { value: "none", label: s("None (local service)", "无（本地服务）") }]}
          onChange={next => next && set("auth", next as ProviderInput["auth"])} />
        {value.auth === "api_key" && <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="provider-api-key">API key</FieldLabel>
            {preset?.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="type-caption inline-flex items-center gap-1 hover:text-foreground">
              {s("Get a key", "获取密钥")}<ExternalLink className="size-3" aria-hidden="true" /></a>}
          </div>
          <Input id="provider-api-key" type="password" autoComplete="off" autoFocus={!current} value={key} disabled={keyAction === "clear"}
            onChange={event => { setKey(event.target.value); setKeyAction("replace"); }}
            placeholder={storedKey ? s("Leave blank to keep the saved key", "留空保留已保存的密钥") : s("Paste API key", "粘贴 API key")} />
          <FieldDescription className={keyAction === "clear" || (current && !storedKey && current.credentialState !== "missing") ? "text-destructive" : undefined}>
            {keyAction === "clear" ? s("The saved key will be removed when saved.", "保存时将移除已保存的密钥。") : current ? credentialLabels()[current.credentialState] : s("Stored with system encryption after saving.", "保存后使用系统加密存储。")}
            {storedKey && <Button type="button" variant="link" size="sm" className="ml-1 h-auto p-0 text-xs"
              onClick={() => { setKey(""); setKeyAction(keyAction === "clear" ? "keep" : "clear"); }}>{keyAction === "clear" ? s("Undo", "撤销") : s("Remove saved key", "移除已保存密钥")}</Button>}
          </FieldDescription>
          {!snapshot?.credentialStorageAvailable && <p className="text-xs text-destructive">{s("System encryption is unavailable. API keys cannot be saved.", "系统加密不可用，无法保存 API key。")}</p>}
        </Field>}
      </FieldGroup>
    </form>

    {current && snapshot && <section className="mt-8 border-t pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="type-section">{s("Models", "模型")}</h3>
        {/* 模型发现尚未接入，入口待 plans/todo-2026-10-07-model-catalog.md 落地后加在此处。 */}
        <Button size="sm" variant="outline" disabled={busy} onClick={event => openModel(null, event.currentTarget)}><Plus />{s("Add model", "添加模型")}</Button>
      </div>
      {models.length ? <ItemGroup className="surface">{models.map((model, index) => <div key={model.id}>{index > 0 && <ItemSeparator />}
        <ModelRow model={model} provider={current} selected={island.child === `model-${model.id}`} onOpen={origin => openModel(model.id, origin)} />
      </div>)}</ItemGroup>
        : <p className="type-caption rounded-md border border-dashed px-3 py-4 text-center">{s("Add the first model to use this provider.", "添加第一个模型即可使用此提供商。")}</p>}
    </section>}
  </Editor>;
}

function TestResult({ test, stale }: { test: ConnectionTest; stale: boolean }) {
  if (test.state === "running") return <span className="type-caption inline-flex items-center gap-1"><Spinner className="size-3" />{s("Testing…", "正在测试…")}</span>;
  if (stale) return <span className="type-caption">{s("Settings changed, test again", "配置已变更，请重新测试")}</span>;
  if (test.state === "succeeded") return <span className="type-caption">{s("Connected", "连接正常")}{test.durationMs !== null && ` · ${test.durationMs} ms`}</span>;
  return <span className="type-caption text-destructive">{test.error ? testHints()[test.error] : test.message}</span>;
}

function ModelRow({ model, provider, selected, onOpen }: { model: ProviderModel; provider: Provider; selected: boolean; onOpen: (origin: HTMLElement) => void }) {
  const { snapshot, busy } = useSettingsConfiguration();
  const quick = useQuickActions();
  const test = snapshot ? latestTest(snapshot, model.id) : undefined;
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
        {running ? s("Cancel", "取消") : s("Test", "测试")}</Button>
      <Switch aria-label={s(`Enable ${model.name}`, `启用 ${model.name}`)} checked={model.enabled} disabled={busy} onCheckedChange={next => void quick.setModelEnabled(model, next)} />
    </ItemActions>
  </Item>;
}

/* ---------- 模型详情：常用字段在前，参数收进高级 ---------- */

function ModelEditor({ initialId, providerId }: { initialId: string | null; providerId: string }) {
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const quick = useQuickActions();
  const [id, setId] = useState(initialId);
  const current = snapshot?.models.find(model => model.id === id);
  const provider = snapshot?.providers.find(item => item.id === providerId);
  const [value, setValue] = useState<ModelValue>(() => current ? modelValue(current) : {
    providerId, name: "", modelId: "", enabled: true, contextWindow: null,
    capabilities: { reasoning: false, tools: true, images: false }, generation: { temperature: null, topP: null, maxOutputTokens: null } });
  const [advanced, setAdvanced] = useState(false);
  const set = <K extends keyof ModelValue>(field: K, next: ModelValue[K]) => setValue(previous => ({ ...previous, [field]: next }));
  // enabled 为即时操作，比较与保存都取快照值。
  const dirty = useMemo(() => !current || JSON.stringify({ ...modelValue(current), enabled: 0 }) !== JSON.stringify({ ...value, enabled: 0 }), [current, value]);
  const test = current && snapshot ? latestTest(snapshot, current.id) : undefined;
  const stale = !!test && !!current && (test.modelRevision !== current.revision || test.providerRevision !== provider?.revision);
  const users = current && snapshot ? snapshot.roles.filter(role => role.modelId === current.id) : [];

  return <Editor form="model-form" title={current?.name ?? s("New model", "新模型")} description={provider?.name} dirty={dirty}
    remove={current ? { title: s("Delete this model?", "删除此模型？"),
      description: users.length
        ? s(`“${current.name}” will be removed. These roles will be unavailable until you choose another model: ${users.map(role => role.name).join(", ")}.`,
          `将移除「${current.name}」。以下角色在重新选择模型前不可用：${users.map(role => role.name).join("、")}。`)
        : s(`“${current.name}” will be removed. No roles use it.`, `将移除「${current.name}」，没有角色使用它。`),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "model", id: current.id }); if (result.ok) void island.close({ force: true }); } } : undefined}>
    <form id="model-form" onSubmit={async event => {
      event.preventDefault();
      const result = await run({ type: "model.save", id, value: { ...value, name: value.name.trim() || value.modelId, enabled: current?.enabled ?? true } });
      if (result.ok) { setId(result.savedId); setValue(previous => ({ ...previous, name: previous.name.trim() || previous.modelId })); }
    }}><FieldGroup>
      <TextField label={s("Server model ID", "服务端模型 ID")} value={value.modelId} onChange={next => set("modelId", next)} required placeholder="gpt-5" />
      <TextField label={s("Display name", "显示名称")} value={value.name} onChange={next => set("name", next)} placeholder={value.modelId || s("Defaults to the model ID", "默认使用模型 ID")} />
      <FieldSet><FieldLegend variant="label">{s("Capabilities", "能力")}</FieldLegend>
        <FieldGroup data-slot="checkbox-group" className="gap-3">
          {([["reasoning", s("Reasoning", "支持思考")], ["tools", s("Tool calls", "支持工具调用")], ["images", s("Image input", "支持图片输入")]] as const).map(([key, label]) =>
            <Field key={key} orientation="horizontal">
              <Checkbox id={`capability-${key}`} checked={value.capabilities[key]} onCheckedChange={next => set("capabilities", { ...value.capabilities, [key]: next === true })} />
              <FieldLabel htmlFor={`capability-${key}`} className="font-normal">{label}</FieldLabel>
            </Field>)}
        </FieldGroup>
      </FieldSet>
      {current && <Field><FieldLabel>{s("Used by", "被引用")}</FieldLabel>
        {users.length ? <ul className="flex flex-wrap gap-1.5" aria-label={s("Roles using this model", "使用此模型的角色")}>
          {users.map(role => <li key={role.id}><Badge variant="secondary">{role.name}</Badge></li>)}
        </ul> : <FieldDescription>{s("No roles use this model.", "没有角色使用此模型。")}</FieldDescription>}
      </Field>}
    </FieldGroup>
      <Button type="button" variant="ghost" size="sm" className="-ml-2 mt-5" aria-expanded={advanced} onClick={() => setAdvanced(open => !open)}>
        <ChevronDown className={advanced ? "rotate-180 transition-transform" : "transition-transform"} />{s("Advanced", "高级")}</Button>
      {advanced && <FieldGroup className="mt-3">
        <NumberField label={s("Context window", "上下文窗口")} value={value.contextWindow} onChange={next => set("contextWindow", next)} min={1} integer />
        <NumberField label={s("Temperature", "温度")} value={value.generation.temperature} onChange={next => set("generation", { ...value.generation, temperature: next })} max={2} />
        <NumberField label="Top P" value={value.generation.topP} onChange={next => set("generation", { ...value.generation, topP: next })} max={1} />
        <NumberField label={s("Maximum output tokens", "最大输出 token")} value={value.generation.maxOutputTokens} onChange={next => set("generation", { ...value.generation, maxOutputTokens: next })} min={1} integer />
      </FieldGroup>}
    </form>
    {current && <section className="mt-7 border-t pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-section">{s("Connection test", "连接测试")}</h3>
        <Button size="sm" variant="secondary" disabled={busy || (test?.state !== "running" && (!current.enabled || !provider?.enabled))} onClick={() => void quick.test(current)}>
          {test?.state === "running" ? s("Cancel test", "取消测试") : s("Test connection", "测试连接")}</Button>
      </div>
      <p className="type-caption mt-1">{s("Sends a short request with the saved settings. Provider charges may apply.", "使用已保存的配置发送简短请求，可能产生提供商费用。")}</p>
      {test && <div role="status" className="mt-3 rounded-md border px-3 py-2">
        <TestResult test={test} stale={stale} />
        {test.state === "failed" && test.message && !stale && <p className="type-caption mt-1 break-words">{test.message}</p>}
      </div>}
      {dirty && <p className="type-caption mt-2">{s("Save first to test your changes.", "保存后才会测试新的修改。")}</p>}
    </section>}
  </Editor>;
}
