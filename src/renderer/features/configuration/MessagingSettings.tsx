import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { useId, useState } from "react";
import { Plus, MessageSquare, RotateCcw } from "lucide-react";
import type { MessagingConnectionStatus } from "@asterism-app/sdk/contracts";
import { Button } from "@asterism-app/ui/ui/button";
import { FieldGroup } from "@asterism-app/ui/ui/field";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { Empty, EmptyContent, EmptyHeader, EmptyDescription, EmptyMedia } from "@asterism-app/ui/ui/empty";
import { StatusText, type StatusTone } from "@asterism-app/ui/ui/status";
import { Switch } from "@asterism-app/ui/ui/switch";
import { useI18n } from "../../shared/i18n";
import { ProviderMark } from "../../shared/ui/ProviderMark";
import { useIsland, useIslandCancel, useIslandKey } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Section } from "@asterism-app/ui/settings-layout";
import { Editor, TextField } from "./forms";
import { ProviderSettingFields } from "./ProviderSettingFields";
import { settingValues, settingsComplete } from "./provider-settings";
import { ServicePicker } from "./ServicePicker";
import { useConfigurationAction, useSettingsConfiguration } from "./state";
import { messagingMessages as messages } from "../../messages/messaging";
import { providersMessages } from "../../messages/providers";

const messagingIslandKey = (id: string | null) => id === null ? "messaging:create" : `messaging:item:${id}`;

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
    key: messagingIslandKey(id), label: id === null ? messages.add : messages.edit, width: panelIslandWidth, origin,
    render: () => id === null ? <MessagingCreation /> : <MessagingEditor key={id} target={{ connectionId: id }} />,
  });
  const connections = snapshot?.messagingConnections ?? [];
  return <Section title={i18n.text(messages.title)} hint={i18n.text(messages.hint)}
    action={<Button size="sm" disabled={!types.length} onClick={event => open(null, event.currentTarget)}>
      <Plus data-icon="inline-start" />{i18n.text(messages.add)}
    </Button>}>
    {snapshot && !connections.length ? <Empty className="surface-group">
      <EmptyHeader><EmptyMedia variant="icon"><MessageSquare /></EmptyMedia><EmptyDescription>{i18n.text(messages.empty)}</EmptyDescription></EmptyHeader>
      {types.length > 0 && <EmptyContent><Button size="sm" variant="outline" onClick={event => open(null, event.currentTarget)}>
        <Plus data-icon="inline-start" />{i18n.text(messages.add)}</Button></EmptyContent>}
    </Empty> : <ItemGroup className="surface-group overflow-clip">{connections.map((connection, index) => {
      const type = types.find(type => type.id === connection.providerId);
      const platform = type ? i18n.text(type.label) : i18n.text(messages.unavailable);
      // The registry reports an error only while a failure is retried or terminal, so its presence decides the details line.
      const { status, identity, error } = connection.runtime;
      const tone = statusTone[status];
      return <div key={connection.id}>
        {index > 0 && <ItemSeparator />}
        <ListRow className="rounded-none" title={connection.name} inactive={!connection.enabled}
          media={<ProviderMark name={platform} status={tone} />}
          description={[platform, identity].filter(Boolean).join(" · ")}
          details={error && <span className="text-destructive">{error}</span>}
          selected={island.has(messagingIslandKey(connection.id))} onOpen={origin => open(connection.id, origin)}
          trailing={<StatusText tone={tone}>{i18n.text(messages[status])}</StatusText>}
          actions={<>
            {restartable.has(status) && <IconButton variant="ghost" size="icon-sm" disabled={action.busy}
              label={i18n.text(messages.restart)}
              onClick={() => void action.run({ type: "messaging.restart", id: connection.id })}>
              <RotateCcw />
            </IconButton>}
            {/* Saving validates against the platform declaration, so connections of an unavailable platform cannot be toggled. */}
            <Switch aria-label={i18n.formatMessage(messages.enableConnection, { connection: connection.name })} checked={connection.enabled}
              disabled={action.busy || !type}
              onCheckedChange={enabled => void action.run({ type: "messaging.save", id: connection.id, value: {
                providerId: connection.providerId, name: connection.name, enabled, settings: connection.settings } })} />
          </>} />
      </div>;
    })}</ItemGroup>}
  </Section>;
}

/* ---------- Platform selection: a platform can hold several connections, each its own identity ---------- */

function MessagingCreation() {
  const i18n = useI18n(), island = useIsland(), { snapshot } = useSettingsConfiguration();
  const [providerId, setProviderId] = useState<string | null>(null);
  useIslandCancel(providerId === null ? async () => { await island.close(); } : null);
  if (providerId !== null) return <MessagingEditor target={{ providerId }} />;
  const types = snapshot?.messagingProviderTypes ?? [];
  const connections = snapshot?.messagingConnections ?? [];
  const choices = types.map(type => {
    const label = i18n.text(type.label);
    const count = connections.filter(connection => connection.providerId === type.id).length;
    return { key: type.id, name: label, mark: <ProviderMark name={label} />,
      note: count > 0 ? i18n.formatMessage(messages.connectionCount, { count }) : undefined,
      onPick: () => setProviderId(type.id) };
  });
  return <ServicePicker title={i18n.text(messages.add)} hint={i18n.text(messages.choosePlatform)} groups={choices.length ? [{ key: "all", choices }] : []}
    empty={<Empty><EmptyHeader><EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
      <EmptyDescription>{i18n.text(messages.noPlatforms)}</EmptyDescription></EmptyHeader></Empty>} />;
}

type MessagingEditorTarget = { connectionId: string } | { providerId: string };

function MessagingEditor({ target }: { target: MessagingEditorTarget }) {
  const i18n = useI18n(), island = useIsland(), form = useId();
  useIslandCancel(async () => { await island.close(); });
  const { snapshot } = useSettingsConfiguration(), action = useConfigurationAction("inline");
  const [id, setId] = useState("connectionId" in target ? target.connectionId : null);
  useIslandKey(messagingIslandKey(id));
  const saved = snapshot?.messagingConnections.find(connection => connection.id === id);
  const providerId = saved?.providerId ?? ("providerId" in target ? target.providerId : undefined);
  const type = snapshot?.messagingProviderTypes.find(type => type.id === providerId);
  const [name, setName] = useState(saved?.name ?? "");
  const [values, setValues] = useState(() => settingValues(type?.settings, saved?.settings ?? {}));
  const savedValues = settingValues(type?.settings, saved?.settings ?? {});
  const complete = !!type && !!name.trim() && settingsComplete(type.settings, values);
  const dirty = name !== (saved?.name ?? "") || Object.entries(values).some(([key, value]) => value !== savedValues[key]);
  const platform = type ? i18n.text(type.label) : i18n.text(messages.unavailable);
  return <Editor title={saved ? saved.name : i18n.formatMessage(providersMessages.newServiceConnection, { service: platform })}
    description={saved ? `${platform} · ${i18n.text(messages[saved.runtime.status])}` : undefined}
    form={form} busy={action.busy} error={action.error} dirty={dirty} saveDisabled={!complete}
    remove={saved ? { title: i18n.text(messages.remove), description: i18n.text(messages.removeHint), onConfirm: async () => {
      if (await action.run({ type: "remove", kind: "messaging", id: saved.id })) void island.close({ force: true });
    } } : undefined}>
    <form id={form} onSubmit={async event => {
      event.preventDefault();
      if (!type || !complete) return;
      // Enablement is an immediate list action; saving keeps the current value and new connections start enabled.
      const result = await action.run({ type: "messaging.save", id, value: { providerId: type.id, name, enabled: saved?.enabled ?? true, settings: values } });
      if (result?.ok) {
        const persisted = result.snapshot.messagingConnections.find(connection => connection.id === result.savedId);
        if (persisted) {
          setName(persisted.name);
          setValues(settingValues(type.settings, persisted.settings));
        }
        setId(result.savedId);
      }
    }}>
      <fieldset disabled={action.busy}><FieldGroup>
        <TextField label={i18n.text(messages.name)} value={name} onChange={setName} required />
        {type && <ProviderSettingFields settings={type.settings} values={values}
          onValue={(key, value) => setValues(current => ({ ...current, [key]: value }))} />}
      </FieldGroup></fieldset>
    </form>
  </Editor>;
}
