import { useState } from "react";
import { Plus } from "lucide-react";
import type { Provider, ProviderInput, ProviderModel } from "../../../shared/configuration";
import { Item, ItemContent, ItemTitle } from "../../shared/ui/item";
import { Button } from "../../shared/ui/button";
import { Field, FieldGroup, FieldLabel } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { useIsland } from "../../shared/weave/Screen";
import { ChoiceField, Editor, NumberField, SaveActions, TextField, ToggleField } from "./forms";
import { s, useSettingsConfiguration } from "./state";

const protocols = [
  { value: "openai-responses", label: "OpenAI Responses" }, { value: "openai-chat", label: "OpenAI Chat Completions" },
  { value: "anthropic", label: "Anthropic Messages" },
];
export function ProvidersSettings() {
  const { snapshot } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null) => island.open({ id: `provider-${id ?? "new"}`, label: s("Provider", "提供商"), width: { min: 400, grow: 1, max: 620 }, render: () => <ProviderEditor key={id ?? "new"} initialId={id} /> });
  return <>
    <p className="type-caption mb-4">{s("Connections, credentials, and the models they provide.", "管理连接、凭据及其提供的具体模型。")}</p>
    {snapshot?.providers.map(provider => <Item key={provider.id} asChild size="sm"><button type="button" className="w-full text-left hover:bg-accent" onClick={() => open(provider.id)}>
      <ItemContent><ItemTitle>{provider.name}</ItemTitle></ItemContent><span className="type-caption">{provider.enabled ? protocols.find(item => item.value === provider.protocol)?.label : s("Disabled", "已停用")}</span>
    </button></Item>)}
    {snapshot?.providers.length === 0 && <p className="type-caption py-4">{s("Add a connection to configure your models.", "添加连接后即可配置模型。")}</p>}
    <Button className="mt-4" disabled={!snapshot} onClick={() => open(null)}><Plus />{s("Add provider", "添加提供商")}</Button>
  </>;
}
const credentialLabels = (): Record<Provider["credentialState"], string> => ({
  not_required: s("No authentication", "无需鉴权"), missing: s("No key saved", "未保存密钥"), available: s("Key saved securely", "密钥已加密保存"),
  storage_unavailable: s("System credential protection is unavailable", "系统凭据保护不可用"), decryption_failed: s("Enter the key again; decryption failed", "密钥解密失败，请重新输入"),
});
function ProviderEditor({ initialId }: { initialId: string | null }) {
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const current = snapshot?.providers.find(item => item.id === id);
  const [value, setValue] = useState<ProviderInput>(() => current ? {
    name: current.name, protocol: current.protocol, baseUrl: current.baseUrl, enabled: current.enabled, auth: current.auth,
  } : { name: "", protocol: "openai-responses", baseUrl: "https://api.openai.com/v1", enabled: true, auth: "api_key" });
  const [key, setKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const set = <K extends keyof ProviderInput>(field: K, next: ProviderInput[K]) => setValue(previous => ({ ...previous, [field]: next }));
  const openModel = (modelId: string | null) => {
    if (id) island.open({ id: `model-${modelId ?? "new"}`, label: s("Provider model", "具体模型"), width: { min: 400, grow: 1, max: 620 }, render: () => <ModelEditor key={modelId ?? "new"} initialId={modelId} providerId={id} /> });
  };
  return <Editor title={s("Provider connection", "提供商连接")}>
    <form onSubmit={async event => {
      event.preventDefault();
      const result = await run({ type: "provider.save", id, value,
        credential: value.auth === "none" || clearKey ? { action: "clear" } : key.trim() ? { action: "replace", value: key } : { action: "keep" } });
      if (result.ok) { setId(result.savedId); setKey(""); setClearKey(false); }
    }}><FieldGroup>
      <TextField label={s("Name", "名称")} value={value.name} onChange={next => set("name", next)} required />
      <ChoiceField label={s("Protocol", "协议")} value={value.protocol} options={protocols} onChange={next => {
        if (!next) return;
        const protocol = next as ProviderInput["protocol"];
        setValue(previous => ({ ...previous, protocol, baseUrl: ["https://api.openai.com/v1", "https://api.anthropic.com/v1"].includes(previous.baseUrl)
          ? protocol === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1" : previous.baseUrl }));
      }} />
      <TextField label="Base URL" value={value.baseUrl} onChange={next => set("baseUrl", next)} required
        hint={value.auth === "api_key" ? s("API keys require HTTPS, except on localhost or a loopback address.", "使用 API key 时需 HTTPS，本机回环地址除外。") : undefined} />
      <ChoiceField label={s("Authentication", "鉴权")} value={value.auth} options={[{ value: "api_key", label: "API key" }, { value: "none", label: s("None (local service)", "无（本地服务）") }]} onChange={next => set("auth", next as ProviderInput["auth"])} />
      {value.auth === "api_key" && <Field><FieldLabel htmlFor="provider-api-key">API key</FieldLabel>
        <Input id="provider-api-key" type="password" autoComplete="off" value={key} onChange={event => { setKey(event.target.value); setClearKey(false); }}
          placeholder={s("Leave blank to keep the saved key", "留空保留已保存的密钥")} />
        <p className="type-caption">{clearKey ? s("The key will be removed when saved.", "保存时将移除密钥。") : current ? credentialLabels()[current.credentialState] : s("No key saved", "未保存密钥")}</p>
        {current && <Button type="button" variant="ghost" size="sm" onClick={() => { setKey(""); setClearKey(previous => !previous); }}>{clearKey ? s("Keep saved key", "保留已保存密钥") : s("Remove saved key", "移除已保存密钥")}</Button>}
        {!snapshot?.credentialStorageAvailable && <p className="text-xs text-destructive">{s("System encryption is unavailable. API keys cannot be saved.", "系统加密不可用，无法保存 API key。")}</p>}
      </Field>}
      <ToggleField label={s("Enabled", "启用")} value={value.enabled} onChange={next => set("enabled", next)} />
    </FieldGroup><SaveActions onRemove={current ? async () => {
      const result = await run({ type: "remove", kind: "provider", id: current.id});
      if (result.ok) island.close();
    } : undefined} /></form>
    {id && <section className="mt-8 border-t pt-5"><h3 className="type-section mb-2">{s("Models", "具体模型")}</h3>
      {snapshot?.models.filter(model => model.providerId === id).map(model => <Item key={model.id} asChild size="sm"><button type="button" className="w-full text-left hover:bg-accent" onClick={() => openModel(model.id)}>
        <ItemContent><ItemTitle>{model.name}</ItemTitle></ItemContent><span className="type-caption truncate">{model.modelId}</span>
      </button></Item>)}
      <Button className="mt-3" variant="secondary" disabled={busy} onClick={() => openModel(null)}><Plus />{s("Add model", "添加模型")}</Button>
    </section>}
  </Editor>;
}
function ModelEditor({ initialId, providerId }: { initialId: string | null; providerId: string }) {
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const current = snapshot?.models.find(model => model.id === id);
  const [value, setValue] = useState<Omit<ProviderModel, "id" | "revision">>(() => current ? {
    providerId: current.providerId, name: current.name, modelId: current.modelId, enabled: current.enabled, contextWindow: current.contextWindow,
    capabilities: { ...current.capabilities }, generation: { ...current.generation },
  } : { providerId, name: "", modelId: "", enabled: true, contextWindow: null, capabilities: { reasoning: false, tools: true, images: false }, generation: { temperature: null, topP: null, maxOutputTokens: null } });
  const set = <K extends keyof typeof value>(field: K, next: typeof value[K]) => setValue(previous => ({ ...previous, [field]: next }));
  const tests = snapshot?.tests.filter(test => test.modelId === id).slice().reverse() ?? [];
  const latest = tests[0];
  const provider = snapshot?.providers.find(item => item.id === providerId);
  return <Editor title={s("Provider model", "具体模型")}><form onSubmit={async event => {
    event.preventDefault(); const result = await run({ type: "model.save", id, value });
    if (result.ok) setId(result.savedId);
  }}><FieldGroup>
    <TextField label={s("Display name", "显示名称")} value={value.name} onChange={next => set("name", next)} required />
    <TextField label={s("Server model ID", "服务端模型 ID")} value={value.modelId} onChange={next => set("modelId", next)} required />
    <ToggleField label={s("Enabled", "启用")} value={value.enabled} onChange={next => set("enabled", next)} />
    <NumberField label={s("Context window", "上下文窗口")} value={value.contextWindow} onChange={next => set("contextWindow", next)} min={1} integer />
    <ToggleField label={s("Reasoning", "支持思考")} value={value.capabilities.reasoning} onChange={next => set("capabilities", { ...value.capabilities, reasoning: next })} />
    <ToggleField label={s("Tool calls", "支持工具调用")} value={value.capabilities.tools} onChange={next => set("capabilities", { ...value.capabilities, tools: next })} />
    <ToggleField label={s("Image input", "支持图片输入")} value={value.capabilities.images} onChange={next => set("capabilities", { ...value.capabilities, images: next })} />
    <NumberField label={s("Temperature", "温度")} value={value.generation.temperature} onChange={next => set("generation", { ...value.generation, temperature: next })} max={2} />
    <NumberField label="Top P" value={value.generation.topP} onChange={next => set("generation", { ...value.generation, topP: next })} max={1} />
    <NumberField label={s("Maximum output tokens", "最大输出 token")} value={value.generation.maxOutputTokens} onChange={next => set("generation", { ...value.generation, maxOutputTokens: next })} min={1} integer />
  </FieldGroup><SaveActions onRemove={current ? async () => {
    const result = await run({ type: "remove", kind: "model", id: current.id});
    if (result.ok) island.close();
  } : undefined} /></form>
    {current && <section className="mt-7 border-t pt-5">
      <h3 className="type-section">{s("Connection test", "连接测试")}</h3>
      <p className="type-caption my-2">{s("Uses the saved configuration and sends a short request. Provider charges may apply.", "使用已保存的配置发送简短请求，可能产生提供商费用。")}</p>
      {latest && <div role="status" className="type-caption my-3">
        <p>{latest.state === "running" ? s("Testing…", "正在测试…") : latest.message}{latest.durationMs !== null && ` · ${latest.durationMs} ms`}</p>
        {(latest.modelRevision !== current.revision || latest.providerRevision !== provider?.revision) && <p>{s("This result used an earlier configuration.", "此结果使用的是之前的配置。")}</p>}
      </div>}
      {latest?.state === "running" ? <Button variant="secondary" disabled={busy} onClick={() => void run({ type: "test.cancel", id: latest.id })}>{s("Cancel test", "取消测试")}</Button>
        : <Button variant="secondary" disabled={busy || !current.enabled || !provider?.enabled} onClick={() => void run({ type: "test.start", modelId: current.id })}>{s("Test connection", "测试连接")}</Button>}
    </section>}
  </Editor>;
}
