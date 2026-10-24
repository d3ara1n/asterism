import { useState } from "react";
import { ArrowUp, ArrowDown, Globe, Plus } from "lucide-react";
import type { WebProviderConnection, WebProviderType } from "@atelier/sdk/contracts";
import { configurationField } from "../../../shared/configuration-fields";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { ListRow } from "@atelier/ui/ui/list-row";
import { ItemGroup, ItemSeparator } from "@atelier/ui/ui/item";
import { Switch } from "@atelier/ui/ui/switch";
import { webProviderMessages as messages } from "../../messages/web-providers";
import { useI18n } from "../../shared/i18n";
import { useIsland } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { ConfigurationValue } from "../../shared/ConfigurationValue";
import { Section } from "../settings/layout";
import { ChoiceField, Editor, EditorSection, TextField, ToggleField } from "./forms";
import { useConfigurationAction, useSettingsConfiguration } from "./state";
import { ConnectionAuthentication, type ConnectionCredentialDraft } from "./ConnectionAuthentication";

export function WebProvidersSettings() {
  const i18n = useI18n(), island = useIsland();
  const { snapshot } = useSettingsConfiguration(), action = useConfigurationAction("toast");
  const connections = snapshot?.webProviders ?? [], types = snapshot?.webProviderTypes ?? [];
  const open = (id: string | null, origin: HTMLElement) => island.open({ id: `web-provider-${id ?? "new"}`, label: messages.edit,
    width: panelIslandWidth, origin, render: () => <WebProviderEditor id={id} /> });
  return <Section title={i18n.text(messages.title)} hint={i18n.text(messages.hint)}
    action={<Button size="sm" disabled={!snapshot || !types.length} onClick={event => open(null, event.currentTarget)}><Plus />{i18n.text(messages.add)}</Button>}>
    {!connections.length ? <p className="type-body p-3 text-muted-foreground">{i18n.text(messages.empty)}</p>
      : <ItemGroup className="surface">{connections.map((connection, index) => {
        const type = types.find(type => type.id === connection.type);
        return <div key={connection.id}>{index > 0 && <ItemSeparator />}<ListRow media={<Globe className="size-4" />} title={connection.name}
          description={type ? [i18n.text(type.label), type.search && i18n.text(messages.search), type.fetch && i18n.text(messages.fetch)].filter(Boolean).join(" · ") : i18n.text(messages.unavailable)}
          selected={island.child === `web-provider-${connection.id}`} onOpen={origin => open(connection.id, origin)}
          actions={<>
            <IconButton size="icon-xs" label={i18n.text(messages.up)} disabled={action.busy || index === 0} onClick={() => void action.run({ type: "webProvider.move", id: connection.id, direction: "up" })}><ArrowUp /></IconButton>
            <IconButton size="icon-xs" label={i18n.text(messages.down)} disabled={action.busy || index === connections.length - 1} onClick={() => void action.run({ type: "webProvider.move", id: connection.id, direction: "down" })}><ArrowDown /></IconButton>
            <Switch aria-label={i18n.text(messages.enabled)} checked={connection.enabled} disabled={action.busy}
              onCheckedChange={enabled => { const { credentialState: _state, ...value } = connection;
                void action.run({ type: "webProvider.save", id: connection.id, value: { ...value, enabled }, credential: { action: "keep" } }); }} />
          </>} /></div>;
      })}</ItemGroup>}
  </Section>;
}
function draft(type: WebProviderType | undefined, used: readonly string[]): WebProviderConnection {
  const base = (type?.id ?? "web").replace(/[/\s]+/gu, "-");
  let id = base;
  for (let n = 2; used.includes(id); n++) id = `${base}-${n}`;
  return { id, name: typeof type?.label === "string" ? type.label : id, type: base, enabled: true,
    ...structuredClone(type?.defaults ?? { baseUrl: "https://example.com", auth: "api_key" as const, settings: {} }) };
}
function WebProviderEditor({ id }: { id: string | null }) {
  const i18n = useI18n(), island = useIsland(), { snapshot } = useSettingsConfiguration();
  const saved = snapshot?.webProviders.find(connection => connection.id === id);
  const types = snapshot?.webProviderTypes ?? [];
  const [value, setValue] = useState<WebProviderConnection>(() => {
    if (saved) { const { credentialState: _state, ...connection } = saved; return structuredClone(connection); }
    return draft(types[0], snapshot?.webProviders.map(item => item.id) ?? []);
  });
  const [credential, setCredential] = useState<ConnectionCredentialDraft>({ action: "keep", key: "" });
  const action = useConfigurationAction("inline"), type = types.find(type => type.id === value.type);
  const settingsField = type ? configurationField(type.settingsSchema) : null;
  const hasSettings = settingsField && !(settingsField.kind === "object" && Object.keys(settingsField.properties).length === 0);
  const set = <K extends keyof WebProviderConnection>(key: K, next: WebProviderConnection[K]) => setValue(value => ({ ...value, [key]: next }));
  const dirty = !saved || credential.action !== "keep" || Object.entries(value).some(([key, item]) => JSON.stringify(item) !== JSON.stringify(saved[key as keyof WebProviderConnection]));
  return <Editor title={i18n.text(id ? messages.edit : messages.add)} form="web-provider-editor" dirty={dirty} busy={action.busy} error={action.error}
    disabled={!!id && !saved} saveDisabled={!type} description={!type ? i18n.text(messages.unavailable) : undefined}
    remove={id ? { title: i18n.text(messages.remove), description: i18n.text(messages.removeHint), onConfirm: async () => {
      if (await action.run({ type: "remove", kind: "webProvider", id })) void island.close({ force: true });
    } } : undefined}>
    <form id="web-provider-editor" className="space-y-6" onSubmit={async event => {
      event.preventDefault();
      if (!type) return;
      if (await action.run({ type: "webProvider.save", id, value, credential: credential.action === "replace"
        ? { action: "replace", value: credential.key } : { action: credential.action } })) void island.close({ force: true });
    }}><fieldset disabled={action.busy} className="space-y-6">
      <EditorSection title={i18n.text(messages.edit)}>
        {!id && <ChoiceField label={i18n.text(messages.type)} value={value.type} options={types.map(type => ({ value: type.id, label: i18n.text(type.label) }))}
          onChange={next => { setValue(draft(types.find(type => type.id === next), snapshot?.webProviders.map(item => item.id) ?? [])); setCredential({ action: "keep", key: "" }); }} />}
        <TextField label={i18n.text(messages.name)} value={value.name} onChange={next => set("name", next)} required />
        <TextField label={i18n.text(messages.id)} value={value.id} onChange={next => set("id", next)} required />
        <ToggleField label={i18n.text(messages.enabled)} value={value.enabled} onChange={next => set("enabled", next)} />
        <TextField label={i18n.text(messages.baseUrl)} value={value.baseUrl} onChange={next => set("baseUrl", next)} required />
        <ConnectionAuthentication auth={value.auth} editable={false} credentialState={saved?.credentialState}
          storageAvailable={snapshot?.credentialStorageAvailable ?? false} draft={credential} onDraftChange={setCredential} onAuthChange={next => set("auth", next)} />
        {type?.keyUrl && <a className="type-caption text-primary-text hover:underline" href={type.keyUrl} target="_blank" rel="noopener noreferrer">{i18n.text(messages.keyLink)}</a>}
        {type && hasSettings && <ConfigurationValue schema={type.settingsSchema} value={value.settings}
            label={i18n.text(messages.settings)} onChange={next => { if (next !== undefined) set("settings", next); }} />}
      </EditorSection>
    </fieldset></form>
  </Editor>;
}
