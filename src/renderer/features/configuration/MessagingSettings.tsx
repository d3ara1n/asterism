import { useId, useState } from "react";
import { Plus, MessageSquare, RotateCcw } from "lucide-react";
import type { MessagingConnectionStatus } from "@asterism-app/sdk/contracts";
import { Button } from "@asterism-app/ui/ui/button";
import { FieldGroup } from "@asterism-app/ui/ui/field";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { Empty, EmptyContent, EmptyHeader, EmptyDescription, EmptyMedia } from "@asterism-app/ui/ui/empty";
import { StatusBadge, type StatusTone } from "@asterism-app/ui/ui/status";
import { useI18n } from "../../shared/i18n";
import { useIsland } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Section } from "../settings/layout";
import { Editor, TextField, ChoiceField, ToggleField } from "./forms";
import { credentialChanged, type ConnectionCredentialDraft } from "./ConnectionAuthentication";
import { ProviderSettingFields, secretUpdates, settingValues, settingsComplete } from "./ProviderSettingFields";
import { useConfigurationAction, useSettingsConfiguration } from "./state";
import { messagingMessages as messages } from "../../messages/messaging";

const statusTone: Record<MessagingConnectionStatus, StatusTone> = {
  connected: "success", connecting: "progress", reconnecting: "warning", failed: "error", disabled: "neutral", unavailable: "error",
};
/** Reconnecting applies to a running connection: a failed one, one retrying, or one the user wants to reset. */
const restartable: ReadonlySet<MessagingConnectionStatus> = new Set(["connected", "reconnecting", "failed"]);

export function MessagingSettings() {
  const i18n = useI18n(), island = useIsland(), { snapshot } = useSettingsConfiguration();
  const action = useConfigurationAction("toast");
  const types = snapshot?.messagingProviderTypes ?? [];
  const open = (id: string | null, origin: HTMLElement) => island.open({
    id: `messaging-${id ?? "new"}`, label: messages.edit, width: panelIslandWidth, origin,
    render: () => <MessagingEditor key={id ?? "new"} id={id} />,
  });
  const connections = snapshot?.messagingConnections ?? [];
  return <Section title={i18n.text(messages.title)} hint={i18n.text(messages.hint)}
    action={<Button size="sm" disabled={!types.length} onClick={event => open(null, event.currentTarget)}>
      <Plus data-icon="inline-start" />{i18n.text(messages.add)}
    </Button>}>
    {snapshot && !connections.length ? <Empty className="border">
      <EmptyHeader><EmptyMedia variant="icon"><MessageSquare /></EmptyMedia><EmptyDescription>{i18n.text(messages.empty)}</EmptyDescription></EmptyHeader>
      {types.length > 0 && <EmptyContent><Button size="sm" variant="outline" onClick={event => open(null, event.currentTarget)}>
        <Plus data-icon="inline-start" />{i18n.text(messages.add)}</Button></EmptyContent>}
    </Empty> : <ItemGroup className="surface overflow-clip">{connections.map((connection, index) => {
      const type = types.find(type => type.id === connection.providerId);
      // The registry reports an error only while a failure is retried or terminal, so its presence decides the description.
      const { status, identity, error } = connection.runtime;
      const description = error ? error
        : [type ? i18n.text(type.label) : i18n.text(messages.unavailable), identity].filter(Boolean).join(" · ");
      return <div key={connection.id}>
        {index > 0 && <ItemSeparator />}
        <ListRow className="rounded-none" mediaVariant="icon" media={<MessageSquare />} title={connection.name}
          description={description} inactive={!connection.enabled}
          selected={island.child === `messaging-${connection.id}`} onOpen={origin => open(connection.id, origin)}
          actions={<>
            <StatusBadge tone={statusTone[status]}>{i18n.text(messages[status])}</StatusBadge>
            {restartable.has(status) && <Button variant="ghost" size="icon-sm" disabled={action.busy}
              aria-label={i18n.text(messages.restart)} title={i18n.text(messages.restart)}
              onClick={() => void action.run({ type: "messaging.restart", id: connection.id })}>
              <RotateCcw />
            </Button>}
          </>} />
      </div>;
    })}</ItemGroup>}
  </Section>;
}

function MessagingEditor({ id }: { id: string | null }) {
  const i18n = useI18n(), island = useIsland(), form = useId();
  const { snapshot } = useSettingsConfiguration(), action = useConfigurationAction("inline");
  const saved = snapshot?.messagingConnections.find(connection => connection.id === id);
  const [providerId, setProviderId] = useState(saved?.providerId ?? snapshot?.messagingProviderTypes[0]?.id ?? "");
  const type = snapshot?.messagingProviderTypes.find(type => type.id === providerId);
  const [name, setName] = useState(saved?.name ?? "");
  const [enabled, setEnabled] = useState(saved?.enabled ?? true);
  const [values, setValues] = useState(() => settingValues(type?.settings, saved?.settings ?? {}));
  const [secrets, setSecrets] = useState<Record<string, ConnectionCredentialDraft>>({});
  const savedValues = settingValues(type?.settings, saved?.settings ?? {});
  const complete = !!type && !!name.trim() && settingsComplete(type.settings, values, secrets, saved?.secrets);
  const dirty = !saved || name !== saved.name || enabled !== saved.enabled ||
    Object.values(secrets).some(credentialChanged) || Object.entries(values).some(([key, value]) => value !== savedValues[key]);
  return <Editor title={i18n.text(messages.edit)} description={type ? i18n.text(type.label) : i18n.text(messages.unavailable)}
    form={form} busy={action.busy} error={action.error} dirty={dirty} saveDisabled={!complete}
    remove={saved ? { title: i18n.text(messages.remove), description: i18n.text(messages.removeHint), onConfirm: async () => {
      if (await action.run({ type: "remove", kind: "messaging", id: saved.id })) void island.close({ force: true });
    } } : undefined}>
    <form id={form} onSubmit={async event => {
      event.preventDefault();
      if (!complete) return;
      if (await action.run({ type: "messaging.save", id, value: { providerId, name, enabled, settings: values }, secrets: secretUpdates(secrets) }))
        void island.close({ force: true });
    }}>
      <fieldset disabled={action.busy}><FieldGroup>
        {!saved && <ChoiceField label={i18n.text(messages.provider)} value={providerId}
          options={(snapshot?.messagingProviderTypes ?? []).map(type => ({ value: type.id, label: i18n.text(type.label) }))}
          onChange={value => {
            if (!value) return;
            setProviderId(value);
            setValues(settingValues(snapshot?.messagingProviderTypes.find(type => type.id === value)?.settings, {}));
            setSecrets({});
          }} />}
        <TextField label={i18n.text(messages.name)} value={name} onChange={setName} required />
        <ToggleField label={i18n.text(messages.enabled)} value={enabled} onChange={setEnabled} />
        {type && <ProviderSettingFields settings={type.settings} values={values} secretStates={saved?.secrets}
          storageAvailable={snapshot?.credentialStorageAvailable ?? false}
          onValue={(key, value) => setValues(current => ({ ...current, [key]: value }))}
          drafts={secrets} onDraft={(key, draft) => setSecrets(current => ({ ...current, [key]: draft }))} />}
      </FieldGroup></fieldset>
    </form>
  </Editor>;
}
