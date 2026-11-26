import { Cable, Plus, Zap, Search, PlugZap } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { applyModelParameters, canEditModelProviderField, createModelInput, modelProviderComplete, modelProviderSchema, modelReference, thinkingSchema, type ConfigurationSnapshot, type ConnectionTest, type ModelProvider, type ProviderModel, type TestError } from "../../../shared/configuration";
import { modelProviderPresetDraft, type LanguageModelProviderPreset, type ModelProviderDraft } from "../../../shared/provider-presets";
import { modelMediaModalities, type ModelMediaModality, type UiMessage } from "@asterism-app/sdk/contracts";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { providersMessages } from "../../messages/providers";
import { thinkingLabels } from "@asterism-app/ui/messages/model-selection";
import { getI18n, useI18n } from "../../shared/i18n";
import { ProviderMark } from "../../shared/ui/ProviderMark";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@asterism-app/ui/ui/empty";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { StatusText } from "@asterism-app/ui/ui/status";
import { Button } from "@asterism-app/ui/ui/button";
import { Checkbox } from "@asterism-app/ui/ui/checkbox";
import { FieldGroup, Field, FieldContent, FieldLabel, FieldDescription, FieldSet, FieldLegend } from "@asterism-app/ui/ui/field";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { Separator } from "@asterism-app/ui/ui/separator";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Switch } from "@asterism-app/ui/ui/switch";
import { useIsland, useIslandCancel, useIslandKey } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Section } from "@asterism-app/ui/settings-layout";
import { ConfigurationActionError, Editor, EditorSection, TextField, NumberField } from "./forms";
import { useConfigurationAction, useSettingsConfiguration } from "./state";
import { ModelCompatibilityEditor } from "./ModelCompatibilityEditor";
import { ModelCostEditor } from "./ModelCostEditor";
import { modelProtocolLabels } from "./protocols";
import { ModelDiscoveryPicker } from "./ModelDiscoveryPicker";
import { ModelOAuthField, useModelOAuth } from "./ModelOAuthField";
import { useModelParameters } from "./ModelParameters";
import { settingValues, settingsComplete } from "./provider-settings";
import { ProviderSettingFields } from "./ProviderSettingFields";
import { modelProviderFields } from "./model-provider-fields";
import { ServicePicker } from "./ServicePicker";
import { ProviderUsageButton } from "./ProviderUsageButton";

/** Modalities name what a model accepts, independent of the file formats that carry it. */
const modalityLabels: Record<ModelMediaModality, UiMessage> = {
  image: providersMessages.imageInput, audio: providersMessages.audioInput,
  video: providersMessages.videoInput, document: providersMessages.documentInput,
};

const protocolLabel = (value: ModelProvider["protocol"]) => modelProtocolLabels[value];
type ProviderValue = Omit<ModelProvider, "enabled">;

/* ---------- State derivation: shared by list and details, both reading the latest snapshot directly ---------- */

const latestTest = (snapshot: ConfigurationSnapshot, modelId: string): ConnectionTest | undefined =>
  snapshot.tests.filter(test => test.model === modelId).at(-1);
/** Suggest the next step by error category; original information remains displayed with the result. */
const testHints = (): Record<TestError, string> => ({
  configuration: getI18n().formatMessage(providersMessages.invalidSettings),
  credential: getI18n().formatMessage(providersMessages.credentialUnavailable),
  authentication: getI18n().formatMessage(providersMessages.credentialRejected),
  model_unavailable: getI18n().formatMessage(providersMessages.modelUnavailable),
  rate_limit: getI18n().formatMessage(providersMessages.rateLimited),
  network: getI18n().formatMessage(providersMessages.networkUnavailable),
  timeout: getI18n().formatMessage(providersMessages.timeout),
  protocol: getI18n().formatMessage(providersMessages.unexpectedResponse),
  server: getI18n().formatMessage(providersMessages.serverError),
  cancelled: getI18n().formatMessage(providersMessages.testCancelled),
});

const providerIslandKey = (id: string | null) => id === null ? "provider:create" : `provider:item:${id}`;
const modelIslandKey = (providerId: string, id: string | null) => id === null ? `model:create:${providerId}` : `model:item:${id}`;
const discoveryIslandKey = (providerId: string) => `model-discovery:item:${providerId}`;

/* ---------- Immediate actions: separate from edit drafts, writing to the same snapshot from any island ---------- */

function useQuickActions() {
  const { snapshot } = useSettingsConfiguration();
  const { run, busy } = useConfigurationAction("toast");
  return {
    busy,
    setProviderEnabled: (provider: ModelProvider, enabled: boolean) => run({ type: "languageModelProvider.save", id: provider.id,
      value: { ...providerValue(provider), enabled } }),
    setModelEnabled: (model: ProviderModel, enabled: boolean) => run({ type: "languageModel.save", id: modelReference(model), value: { ...modelValue(model), enabled } }),
    test: (model: ProviderModel) => {
      const running = snapshot && latestTest(snapshot, modelReference(model));
      return running?.state === "running" ? run({ type: "languageModel.test.cancel", id: running.id }) : run({ type: "languageModel.test.start", model: modelReference(model) });
    },
  };
}
/** Detail drafts and quick actions share field projection; each operation explicitly supplies the enabled state. */
const providerValue = (provider: ModelProvider): ProviderValue => ({
  id: provider.id, name: provider.name, protocol: provider.protocol, baseUrl: provider.baseUrl, auth: provider.auth, apiKey: provider.apiKey,
  compatibility: structuredClone(provider.compatibility),
  ...(provider.oauthProvider && { oauthProvider: provider.oauthProvider }),
  ...(provider.iconId !== undefined && { iconId: provider.iconId }),
  ...(provider.usage !== undefined && { usage: provider.usage }),
  ...(provider.fixedFields && { fixedFields: [...provider.fixedFields] }),
});
const modelValue = (model: ProviderModel): ProviderModel => structuredClone(model);

/* ---------- Root: provider overview ---------- */

export function ModelProvidersSettings() {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null, origin?: HTMLElement | null) => island.open({ key: providerIslandKey(id), label: providersMessages.provider, width: panelIslandWidth, origin,
    render: () => id === null ? <ProviderCreation /> : <ProviderEditor key={id} initialId={id} /> });
  const providers = snapshot?.languageModelProviders ?? [];
  return <Section title={i18n.formatMessage(providersMessages.connections)} hint={i18n.formatMessage(providersMessages.summary)}
    action={<Button size="sm" disabled={!snapshot} onClick={event => open(null, event.currentTarget)}><Plus />{i18n.formatMessage(providersMessages.addProvider)}</Button>}>
    {snapshot && !providers.length ? <Empty className="surface-group">
      <EmptyHeader><EmptyMedia variant="icon"><Zap /></EmptyMedia><EmptyDescription>{i18n.formatMessage(providersMessages.emptyConnections)}</EmptyDescription></EmptyHeader>
      <EmptyContent><Button size="sm" variant="outline" onClick={event => open(null, event.currentTarget)}><Plus />{i18n.formatMessage(providersMessages.addFirstProvider)}</Button></EmptyContent>
    </Empty> : snapshot && <ItemGroup className="surface-group">{providers.map((provider, index) => {
      return <div key={provider.id}>{index > 0 && <ItemSeparator />}
        <ProviderRow provider={provider} snapshot={snapshot} selected={island.has(providerIslandKey(provider.id))} onOpen={origin => open(provider.id, origin)} />
      </div>;
    })}</ItemGroup>}
  </Section>;
}

function ProviderRow({ provider, snapshot, selected, onOpen }: {
  provider: ModelProvider; snapshot: ConfigurationSnapshot; selected: boolean; onOpen: (origin: HTMLElement) => void;
}) {
  const i18n = useI18n();
  const quick = useQuickActions();
  const models = snapshot.languageModels.filter(model => model.providerId === provider.id);
  const enabled = models.filter(model => model.enabled).length;
  return <ListRow media={<ProviderMark name={provider.name} iconId={provider.iconId} />}
    title={provider.name} selected={selected} inactive={!provider.enabled} onOpen={onOpen}
    description={<>{canEditModelProviderField(provider, "protocol") && <>{protocolLabel(provider.protocol)} · </>}{i18n.formatMessage(providersMessages.modelCount, { count: models.length, enabled })}</>}
    actions={<>
      {provider.enabled && provider.usage && <ProviderUsageButton key={provider.usage} providerId={provider.id} />}
      <Switch aria-label={i18n.formatMessage(providersMessages.enableProvider, { provider_name: provider.name })} checked={provider.enabled} disabled={quick.busy}
        onCheckedChange={next => void quick.setProviderEnabled(provider, next)} />
    </>} />;
}

/* ---------- Preset selection: grouped by billing method, with an adaptive grid and cross-group search ---------- */

const billingOrder = ["usage", "subscription", "none"] as const satisfies readonly LanguageModelProviderPreset["billing"][];
const billingLabels = {
  usage: providersMessages.payAsYouGo,
  subscription: providersMessages.subscription,
  none: providersMessages.noBilling,
};
function presetDescription(preset: LanguageModelProviderPreset, presets: readonly LanguageModelProviderPreset[], includeBilling = true): string {
  const i18n = getI18n();
  const text = (value: LanguageModelProviderPreset["region"]) => value ? i18n.text(value) : "";
  // Subtitles distinguish choices rather than inventory connection attributes. Billing is already grouped;
  // region and plan distinguish endpoint/product variants. Add protocol only when those labels still collide
  // (currently Command Code). Compare the full catalog so search filtering preserves the distinction.
  const showProtocol = presets.some(other => other.name === preset.name && other.billing === preset.billing
    && text(other.region) === text(preset.region) && text(other.plan) === text(preset.plan)
    && other.connection.protocol !== preset.connection.protocol);
  return [text(preset.region), text(preset.plan), showProtocol && protocolLabel(preset.connection.protocol), includeBilling && i18n.text(billingLabels[preset.billing])].filter(Boolean).join(" · ");
}
const searchThreshold = 8;
function PresetPicker({ onPick }: { onPick: (preset: LanguageModelProviderPreset | null) => void }) {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  const languageModelProviderPresets = snapshot?.languageModelProviderPresets ?? [];
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = languageModelProviderPresets.filter(preset => !q || [preset.name, preset.id, presetDescription(preset, languageModelProviderPresets), ...(preset.keywords ?? [])].some(word => word.toLowerCase().includes(q)));
  const groups = billingOrder.map(billing => ({
    key: billing, title: i18n.text(billingLabels[billing]),
    choices: matches.filter(preset => preset.billing === billing).map(preset => ({
      key: preset.id, name: preset.name, description: presetDescription(preset, languageModelProviderPresets, false) || undefined,
      mark: <ProviderMark name={preset.name} iconId={preset.iconId} />, onPick: () => onPick(preset),
    })),
  })).filter(group => group.choices.length);
  return <ServicePicker title={i18n.formatMessage(providersMessages.confirmAddProvider)} hint={i18n.formatMessage(providersMessages.presetHint)} groups={groups}
    search={languageModelProviderPresets.length > searchThreshold ? { value: query, onChange: setQuery, label: i18n.formatMessage(providersMessages.searchProviders) } : undefined}
    empty={q && <p className="type-caption">{i18n.formatMessage(providersMessages.noMatchingProvider)}</p>}
    footer={{ key: "custom", open: true, name: i18n.formatMessage(providersMessages.customConnection), description: i18n.formatMessage(providersMessages.customConnectionHint),
      mark: <ProviderMark name="" glyph={<Cable />} />, onPick: () => onPick(null) }} />;
}

/* ---------- Provider details ---------- */

/** Normalize a display name into an ID: lowercase, replace whitespace with hyphens, and remove disallowed characters; model IDs allow `/`. */
export function slugify(name: string, options: { slash?: boolean } = {}): string {
  const allowed = options.slash ? /[^\p{L}\p{N}._\/-]/gu : /[^\p{L}\p{N}._-]/gu;
  return name.trim().toLowerCase().replace(/\s+/gu, "-").replace(allowed, "").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
}
const blank: ProviderValue = { id: "", name: "", protocol: "openai-responses", baseUrl: "", auth: "api_key", apiKey: "", compatibility: [] };

/** The selection entry generates configuration and editing rules; the editor receives only the service name and key link and does not retain preset identity. */
function ProviderCreation() {
  const { snapshot } = useSettingsConfiguration();
  const [picked, setPicked] = useState<{ value: ProviderValue; service?: string; keyUrl?: string } | null>(null);
  const island = useIsland();
  useIslandCancel(picked ? null : async () => { await island.close(); });
  if (picked) return <ProviderEditor initialId={null} initialValue={picked.value} service={picked.service} keyUrl={picked.keyUrl} />;
  return <PresetPicker onPick={preset => setPicked(preset ? { service: preset.name, keyUrl: preset.keyUrl, value: {
    ...modelProviderPresetDraft(preset, snapshot?.languageModelProviders.map(provider => provider.id)), apiKey: "",
    name: [preset.name, presetDescription(preset, snapshot?.languageModelProviderPresets ?? [])].filter(Boolean).join(" · "),
  } } : { value: structuredClone(blank) })} />;
}

function ProviderEditor({ initialId, initialValue = blank, service, keyUrl }: { initialId: string | null; initialValue?: ProviderValue; service?: string; keyUrl?: string }) {
  const i18n = useI18n(), form = useId();
  const { snapshot } = useSettingsConfiguration();
  const { run, busy, error } = useConfigurationAction("inline");
  const discoveryAction = useConfigurationAction("inline");
  const oauthAction = useConfigurationAction("inline");
  const island = useIsland();
  useIslandCancel(async () => { await island.close(); });
  const [id, setId] = useState(initialId);
  useIslandKey(providerIslandKey(id));
  const current = snapshot?.languageModelProviders.find(item => item.id === id);
  // Drafts omit enabled: enabling is an immediate action that always uses the snapshot, preventing mutual overwrites with the parent island's switch.
  const [value, setValue] = useState<ProviderValue>(() => current ? providerValue(current) : structuredClone(initialValue));
  const set = <K extends keyof typeof value>(field: K, next: (typeof value)[K]) => setValue(previous => ({ ...previous, [field]: next }));
  // A prefilled ID remains independent; for a blank connection, generate it from the name until the user edits the ID manually.
  const [idEdited, setIdEdited] = useState(!!current || !!initialValue.id);
  const setName = (name: string) => setValue(previous => ({ ...previous, name, ...(idEdited ? {} : { id: slugify(name) }) }));

  const oauth = useModelOAuth();
  const authorization = oauth.draft.stage === "authorized" ? oauth.draft.id : undefined;
  const waiting = oauth.draft.stage === "waiting";
  const saved = current ? providerValue(current) : null;
  const dirty = !!authorization || !saved || JSON.stringify(saved) !== JSON.stringify(value);
  const oauthState = current?.oauthProvider === value.oauthProvider ? current?.oauthState : undefined;
  const oauthProvider = value.auth === "oauth" ? value.oauthProvider : undefined;
  const disconnectOAuth = async () => {
    if (!current) return;
    await oauthAction.run({ type: "languageModelProvider.save", id: current.id,
      value: { ...providerValue(current), enabled: current.enabled }, authorization: null });
  };
  const fields = modelProviderFields(value, snapshot?.usageProviders ?? [], keyUrl);
  const values = settingValues(fields, {
    name: value.name, id: value.id, protocol: value.protocol, baseUrl: value.baseUrl, auth: value.auth, apiKey: value.apiKey,
    usage: value.usage ? `usage:${value.usage}` : "off", oauthProvider: value.oauthProvider ?? "",
  });
  const complete = modelProviderSchema.safeParse({ ...value, enabled: current?.enabled ?? true }).success
    && modelProviderComplete(value) && settingsComplete(fields, values)
    && (value.auth !== "oauth" || !!value.oauthProvider && (!!current || !!authorization));
  const setField = (key: string, next: string) => {
    if (key === "name") setName(next);
    else if (key === "id") { setIdEdited(true); set("id", next); }
    else if (key === "usage") set("usage", next === "off" ? null : next.slice(6));
    else if (key === "auth" || key === "oauthProvider") {
      oauth.cancel();
      setValue(previous => key === "auth" ? { ...previous, auth: next as ProviderValue["auth"],
        oauthProvider: next === "oauth" ? previous.oauthProvider ?? "chatgpt" : undefined }
        : { ...previous, oauthProvider: next as ProviderValue["oauthProvider"] });
    } else setValue(previous => ({ ...previous, [key]: next }));
  };

  const openModel = (modelId: string | null, origin?: HTMLElement | null) => {
    if (id) island.open({ key: modelIslandKey(id, modelId), label: providersMessages.model, width: panelIslandWidth, origin,
      render: () => <ModelEditor key={modelId ?? "new"} initialId={modelId} providerId={id} /> });
  };
  const models = snapshot?.languageModels.filter(model => model.providerId === id) ?? [];

  const title = current?.name ?? (service ? i18n.formatMessage(providersMessages.newServiceConnection, { service }) : i18n.formatMessage(providersMessages.newProvider));
  return <Editor form={form} title={title} dirty={dirty} busy={busy} error={error} saveDisabled={!complete || waiting || oauthAction.busy}
    description={canEditModelProviderField(value, "protocol") ? protocolLabel(value.protocol) : undefined}
    remove={current ? { title: i18n.formatMessage(providersMessages.deleteProviderTitle),
      description: i18n.formatMessage(providersMessages.deleteProviderDescription, { current_name: current.name, models_length: models.length }),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "languageModelProvider", id: current.id }); if (result?.ok) void island.close({ force: true }); } } : undefined}>
    <form id={form} onSubmit={async event => {
      event.preventDefault();
      if (!complete || waiting || oauthAction.busy) return;
      const result = await run({ type: "languageModelProvider.save", id, authorization, value: { ...value, enabled: current?.enabled ?? true } });
      if (result?.ok) {
        const persisted = result.snapshot.languageModelProviders.find(item => item.id === result.savedId);
        if (persisted) setValue(providerValue(persisted));
        oauth.commit();
        setId(result.savedId);
      }
    }}><fieldset disabled={busy} className="contents">
      <EditorSection title={i18n.formatMessage(providersMessages.connection)}><FieldGroup>
        <ProviderSettingFields settings={fields} values={values} onValue={setField} />
        {oauthProvider && <ModelOAuthField provider={oauthProvider} state={oauthState} draft={oauth.draft}
          error={oauth.error ?? (oauthState === "connected" && oauth.draft.stage === "idle" ? oauthAction.error : null)}
          disconnectDisabled={oauthAction.busy || dirty} onConnect={() => void oauth.start(oauthProvider, id)} onCancel={oauth.cancel}
          onDisconnect={() => void disconnectOAuth()} />}
      </FieldGroup></EditorSection>
      {canEditModelProviderField(value, "compatibility") && <ModelCompatibilityEditor value={value.compatibility} onChange={next => set("compatibility", next)} />}
      </fieldset></form>

    {current && snapshot && <EditorSection title={i18n.formatMessage(providersMessages.models)}
      hint={dirty ? i18n.text(providersMessages.saveBeforeDiscovery) : undefined}
      status={<ConfigurationActionError error={discoveryAction.error} />}
      action={<>
        <Button size="sm" variant="outline" disabled={busy || dirty || discoveryAction.busy} onClick={async event => {
          const origin = event.currentTarget;
          const result = await discoveryAction.run({ type: "languageModel.discovery.start", providerId: current.id });
          if (result?.ok) island.open({ key: discoveryIslandKey(current.id), label: providersMessages.fetchModels, width: panelIslandWidth, origin,
            render: () => <ModelDiscoveryPicker providerId={current.id} /> });
        }}><Search />{i18n.text(providersMessages.fetchModels)}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={event => openModel(null, event.currentTarget)}><Plus />{i18n.formatMessage(providersMessages.addModel)}</Button>
      </>}>
      {models.length ? <ItemGroup className="surface-group">{models.map((model, index) => <div key={modelReference(model)}>{index > 0 && <ItemSeparator />}
        <ModelRow model={model} provider={current} selected={island.has(modelIslandKey(current.id, modelReference(model)))} onOpen={origin => openModel(modelReference(model), origin)} />
      </div>)}</ItemGroup>
        : <Empty className="surface-group md:p-6"><EmptyHeader><EmptyDescription>{i18n.formatMessage(providersMessages.emptyModels)}</EmptyDescription></EmptyHeader></Empty>}
    </EditorSection>}
  </Editor>;
}

function TestResult({ test }: { test: ConnectionTest }) {
  const i18n = useI18n();
  if (test.state === "running") return <StatusText tone="progress">{i18n.formatMessage(providersMessages.testing)}</StatusText>;
  if (test.state === "succeeded") return <StatusText tone="success">{i18n.formatMessage(providersMessages.testConnected)}{test.durationMs !== null && ` · ${test.durationMs} ms`}</StatusText>;
  return <StatusText tone="error">{test.error ? testHints()[test.error] : test.message}</StatusText>;
}

function ModelRow({ model, provider, selected, onOpen }: { model: ProviderModel; provider: ModelProvider; selected: boolean; onOpen: (origin: HTMLElement) => void }) {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  const quick = useQuickActions();
  const { busy } = quick;
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

/* ---------- Model details: basic information, parameters, compatibility settings, and connection testing; parameter fetching belongs to the parameters section ---------- */

function ModelEditor({ initialId, providerId }: { initialId: string | null; providerId: string }) {
  const i18n = useI18n(), form = useId();
  const { snapshot } = useSettingsConfiguration();
  const { run, busy, error } = useConfigurationAction("inline");
  const island = useIsland();
  useIslandCancel(async () => { await island.close(); });
  const quick = useQuickActions();
  const [id, setId] = useState(initialId);
  useIslandKey(modelIslandKey(providerId, id));
  const current = snapshot?.languageModels.find(model => modelReference(model) === id);
  const provider = snapshot?.languageModelProviders.find(item => item.id === providerId);
  const [value, setValue] = useState<ProviderModel>(() => current ? modelValue(current) : createModelInput(providerId, { name: "", modelId: "" }));
  const set = <K extends keyof ProviderModel>(field: K, next: ProviderModel[K]) => setValue(previous => ({ ...previous, [field]: next }));
  // As with providers: the name comes first and generates the ID; stop overwriting after manual ID editing or when editing an existing model.
  const [idEdited, setIdEdited] = useState(!!current);
  const setName = (name: string) => setValue(previous => ({ ...previous, name, ...(idEdited ? {} : { modelId: slugify(name, { slash: true }) }) }));
  // enabled is an immediate action; comparisons and saves both use the snapshot value.
  const dirty = useMemo(() => !current || JSON.stringify({ ...modelValue(current), enabled: 0 }) !== JSON.stringify({ ...value, enabled: 0 }), [current, value]);
  const test = current && snapshot ? latestTest(snapshot, modelReference(current)) : undefined;
  const parameters = useModelParameters(value.modelId, busy, fetched => setValue(draft => applyModelParameters(draft, fetched)));

  return <Editor form={form} title={current?.name ?? i18n.formatMessage(providersMessages.newModel)} description={provider?.name} dirty={dirty}
    busy={busy} error={error} disabled={parameters.pending}
    remove={current ? { title: i18n.formatMessage(providersMessages.deleteModelTitle),
      description: i18n.formatMessage(providersMessages.deleteUnusedModelDescription, { current_name: current.name }),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "languageModel", id: modelReference(current) }); if (result?.ok) void island.close({ force: true }); } } : undefined}>
    <form id={form} onSubmit={async event => {
      event.preventDefault();
      const result = await run({ type: "languageModel.save", id, value: { ...value, enabled: current?.enabled ?? true } });
      if (result?.ok) {
        const persisted = result.snapshot.languageModels.find(item => modelReference(item) === result.savedId);
        if (persisted) setValue(modelValue(persisted));
        setId(result.savedId);
      }
    }}><fieldset disabled={busy || parameters.pending} className="contents"><FieldGroup>
      <TextField label={i18n.formatMessage(providersMessages.modelDisplayName)} value={value.name} onChange={setName} required />
      <TextField label={i18n.formatMessage(providersMessages.serverModelId)} value={value.modelId} onChange={next => { setIdEdited(true); set("modelId", next); }} required hint={i18n.formatMessage(providersMessages.serverModelIdHint)} />

    </FieldGroup>
      <EditorSection collapsible title={i18n.formatMessage(providersMessages.parameters)} action={parameters.action}
        hint={parameters.hint}
        status={parameters.feedback}>
        <FieldSet><FieldLegend variant="label">{i18n.formatMessage(providersMessages.capabilities)}</FieldLegend>
          <div className="surface-group">
            <FieldGroup className="gap-4 p-4">
              <Field orientation="horizontal">
                <FieldContent><FieldLabel htmlFor={`${form}-capability-reasoning`}>{i18n.formatMessage(providersMessages.reasoning)}</FieldLabel></FieldContent>
                <Switch id={`${form}-capability-reasoning`} checked={value.capabilities.reasoning}
                  onCheckedChange={reasoning => set("capabilities", { ...value.capabilities, reasoning })} />
              </Field>
              {value.capabilities.reasoning && <FieldSet className="gap-3" aria-describedby={`${form}-thinking-levels-description`}>
                <FieldLegend variant="label">{i18n.formatMessage(providersMessages.availableThinkingLevels)}</FieldLegend>
                <FieldDescription id={`${form}-thinking-levels-description`}>{i18n.formatMessage(providersMessages.thinkingLevelsHint)}</FieldDescription>
                <FieldGroup className="grid grid-cols-3 gap-x-4 gap-y-3">
                  {thinkingSchema.options.map(level => <Field key={level} orientation="horizontal">
                    <Checkbox id={`${form}-thinking-${level}`} checked={value.capabilities.thinkingLevels.includes(level)}
                      onCheckedChange={checked => set("capabilities", { ...value.capabilities,
                        thinkingLevels: thinkingSchema.options.filter(item => item === level ? checked === true : value.capabilities.thinkingLevels.includes(item)) })} />
                    <FieldLabel htmlFor={`${form}-thinking-${level}`}>{i18n.text(thinkingLabels[level])}</FieldLabel>
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
                <FieldContent><FieldLabel htmlFor={`${form}-capability-tools`}>{i18n.formatMessage(providersMessages.toolCalls)}</FieldLabel></FieldContent>
                <Switch id={`${form}-capability-tools`} checked={value.capabilities.tools}
                  onCheckedChange={tools => set("capabilities", { ...value.capabilities, tools })} />
              </Field>
            </FieldGroup>
            <Separator />
            <FieldGroup className="p-4">
              <FieldSet className="gap-3">
                <FieldLegend variant="label">{i18n.text(providersMessages.inputModalities)}</FieldLegend>
                <FieldGroup className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {modelMediaModalities.map(modality => <Field key={modality} orientation="horizontal">
                    <Checkbox id={`${form}-input-${modality}`} checked={value.capabilities.inputModalities?.includes(modality) ?? false}
                      onCheckedChange={checked => set("capabilities", { ...value.capabilities,
                        inputModalities: modelMediaModalities.filter(item => item === modality ? checked === true : value.capabilities.inputModalities?.includes(item)) })} />
                    <FieldLabel htmlFor={`${form}-input-${modality}`}>{i18n.text(modalityLabels[modality])}</FieldLabel>
                  </Field>)}
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </div>
        </FieldSet>
        <FieldGroup>
          <NumberField label={i18n.formatMessage(providersMessages.contextWindow)} value={value.contextWindow} onChange={next => set("contextWindow", next)} min={1} integer />
          <NumberField label={i18n.formatMessage(providersMessages.temperature)} value={value.generation.temperature} onChange={next => set("generation", { ...value.generation, temperature: next })} min={null} />
          <NumberField label="Top P" value={value.generation.topP} onChange={next => set("generation", { ...value.generation, topP: next })} min={null} />
          <NumberField label={i18n.formatMessage(providersMessages.maximumOutputTokens)} value={value.generation.maxOutputTokens} onChange={next => set("generation", { ...value.generation, maxOutputTokens: next })} min={1} integer />
        </FieldGroup>
      </EditorSection>
      <ModelCostEditor value={value.cost} onChange={next => set("cost", next)} />
      {provider && canEditModelProviderField(provider, "compatibility") && <ModelCompatibilityEditor value={value.compatibility} inherited={provider.compatibility} onChange={next => set("compatibility", next)} />}
      </fieldset>
    </form>
    {current && <EditorSection title={i18n.formatMessage(providersMessages.connectionTest)}
      hint={<>{i18n.formatMessage(providersMessages.testHint)}{dirty && <> {i18n.formatMessage(providersMessages.saveBeforeTest)}</>}</>}
      action={<Button size="sm" variant="outline" disabled={quick.busy || (test?.state !== "running" && (!current.enabled || !provider?.enabled))} onClick={() => void quick.test(current)}>
        {test?.state === "running" ? <><Spinner data-icon="inline-start" />{i18n.formatMessage(providersMessages.cancelTest)}</> : <><PlugZap data-icon="inline-start" />{i18n.formatMessage(providersMessages.testConnection)}</>}</Button>}>
      {test && <div role="status" className="flex flex-col gap-1">
        <TestResult test={test} />
        {test.state === "failed" && test.message && <p className="type-caption break-words">{test.message}</p>}
      </div>}
    </EditorSection>}
  </Editor>;
}
