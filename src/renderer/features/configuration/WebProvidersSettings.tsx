import { useState } from "react";
import { Globe, Plus } from "lucide-react";
import { webProviderMessages as messages } from "../../messages/web-providers";
import { useI18n } from "../../shared/i18n";
import { useIsland } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Button } from "@atelier/ui/ui/button";
import { ListRow } from "@atelier/ui/ui/list-row";
import { ItemGroup, ItemSeparator } from "@atelier/ui/ui/item";
import { Switch } from "@atelier/ui/ui/switch";
import { Field, FieldLabel } from "@atelier/ui/ui/field";
import { Input } from "@atelier/ui/ui/input";
import { Editor, ChoiceField, ToggleField } from "./forms";
import { useConfigurationAction, useSettingsConfiguration } from "./state";
import { Section } from "../settings/layout";

export function WebProvidersSettings() {
  const i18n = useI18n(), island = useIsland();
  const { snapshot } = useSettingsConfiguration(), action = useConfigurationAction("toast");
  const types = snapshot?.webProviderTypes ?? [];
  const states = snapshot?.webProviders ?? [];
  const unconfigured = types.filter(type => !states.some(state => state.id === type.id));
  const open = (id: string | null, origin: HTMLElement) => island.open({
    id: `web-provider-${id ?? "new"}`, label: messages.edit, width: panelIslandWidth, origin,
    render: () => <WebProviderEditor id={id} />,
  });
  return <Section title={i18n.text(messages.title)} hint={i18n.text(messages.hint)}
    action={<Button size="sm" disabled={!snapshot || !unconfigured.length} onClick={event => open(null, event.currentTarget)}>
      <Plus />{i18n.text(messages.add)}</Button>}>
    {!states.length ? <p className="type-body p-3 text-muted-foreground">{i18n.text(messages.empty)}</p>
      : <ItemGroup className="surface">{states.map((state, index) => {
        const type = types.find(type => type.id === state.id);
        return <div key={state.id}>{index > 0 && <ItemSeparator />}
          <ListRow media={<Globe className="size-4" />} title={type ? i18n.text(type.label) : state.id}
            description={type ? [type.search && i18n.text(messages.search), type.fetch && i18n.text(messages.fetch)].filter(Boolean).join(" · ")
              : i18n.text(messages.unavailable)}
            selected={island.child === `web-provider-${state.id}`} onOpen={origin => open(state.id, origin)}
            actions={<Switch aria-label={i18n.text(messages.enabled)} checked={state.enabled} disabled={action.busy}
              onCheckedChange={enabled => void action.run({ type: "webProvider.save", id: state.id, enabled, credential: { action: "keep" } })} />} />
        </div>;
      })}</ItemGroup>}
  </Section>;
}

function WebProviderEditor({ id }: { id: string | null }) {
  const i18n = useI18n(), island = useIsland(), { snapshot } = useSettingsConfiguration();
  const types = snapshot?.webProviderTypes ?? [];
  const states = snapshot?.webProviders ?? [];
  const saved = id ? states.find(state => state.id === id) : null;
  const unconfigured = types.filter(type => !states.some(state => state.id === type.id));
  const [typeId, setTypeId] = useState(() => id ?? unconfigured[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(() => saved?.enabled ?? true);
  const action = useConfigurationAction("inline");
  const type = types.find(type => type.id === typeId);
  if (id && !saved) return null;
  const keyConfigured = saved?.credentialState === "available";
  // 新增始终可提交；编辑在密钥或启用状态变化时可提交。
  const dirty = !saved || apiKey.length > 0 || saved.enabled !== enabled;
  return <Editor title={id ? i18n.text(type?.label ?? id) : i18n.text(messages.add)} form="web-provider-editor" dirty={dirty}
    busy={action.busy} error={action.error}
    remove={saved ? { title: i18n.text(messages.remove), description: i18n.text(messages.removeHint), onConfirm: async () => {
      if (await action.run({ type: "remove", kind: "webProvider", id: saved.id })) void island.close({ force: true });
    } } : undefined}>
    <form id="web-provider-editor" className="space-y-6" onSubmit={async event => {
      event.preventDefault();
      if (!type) return;
      const credential = apiKey.trim() ? { action: "replace" as const, value: apiKey.trim() } : { action: "keep" as const };
      if (await action.run({ type: "webProvider.save", id: typeId, enabled, credential })) {
        setApiKey("");
        void island.close({ force: true });
      }
    }}><fieldset disabled={action.busy} className="space-y-6">
      {!id && <ChoiceField label={i18n.text(messages.type)} value={typeId}
        options={unconfigured.map(type => ({ value: type.id, label: i18n.text(type.label) }))}
        onChange={next => { if (next) setTypeId(next); }} />}
      {saved && <ToggleField label={i18n.text(messages.enabled)} value={enabled} onChange={setEnabled} />}
      {type?.credential?.kind === "api_key" && <>
        <Field><FieldLabel htmlFor="web-provider-api-key">{i18n.text(messages.apiKey)}</FieldLabel>
          <Input id="web-provider-api-key" type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)}
            placeholder={keyConfigured ? i18n.text(messages.apiKeySet) : i18n.text(messages.apiKeyEmpty)} /></Field>
        {type.credential.keyUrl && <a className="type-caption text-primary-text hover:underline"
          href={type.credential.keyUrl} target="_blank" rel="noopener noreferrer">{i18n.text(messages.keyLink)}</a>}
      </>}
    </fieldset></form>
  </Editor>;
}
