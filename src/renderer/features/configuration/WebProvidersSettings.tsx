import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, FileDown, Globe, GripVertical, Plus, Search } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import type { WebProviderType } from "@asterism-app/sdk/contracts";
import { webProviderMessages as messages } from "../../messages/web-providers";
import { providersMessages } from "../../messages/providers";
import { useI18n } from "../../shared/i18n";
import { ProviderMark } from "../../shared/ui/ProviderMark";
import { useIsland, useIslandCancel, useIslandKey } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@asterism-app/ui/ui/empty";
import { ListRow, ListRowAction } from "@asterism-app/ui/ui/list-row";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Field, FieldDescription, FieldLabel } from "@asterism-app/ui/ui/field";
import { StatusBadge, type StatusTone } from "@asterism-app/ui/ui/status";
import { cn } from "@asterism-app/ui/utils";
import { Editor } from "./forms";
import { useConfigurationAction, useSettingsConfiguration } from "./state";
import { Section } from "@asterism-app/ui/settings-layout";
import { ServicePicker } from "./ServicePicker";
import { ProviderSettingFields } from "./ProviderSettingFields";
import { settingValues, settingsComplete } from "./provider-settings";

const webProviderIslandKey = (id: string | null) => id === null ? "web-provider:create" : `web-provider:item:${id}`;

/** Capability marks: what the service answers, as compact neutral chips beside each other. */
function Capabilities({ type }: { type: WebProviderType }) {
  const i18n = useI18n();
  return <span className="inline-flex gap-1 align-middle">
    {type.search && <Badge variant="secondary" className="font-normal"><Search />{i18n.text(messages.search)}</Badge>}
    {type.fetch && <Badge variant="secondary" className="font-normal"><FileDown />{i18n.text(messages.fetch)}</Badge>}
  </span>;
}
function useCapabilities() {
  const i18n = useI18n();
  return (type: WebProviderType) => [type.search && i18n.text(messages.search), type.fetch && i18n.text(messages.fetch)].filter(Boolean).join(" · ");
}
/** Surface unavailable provider types. */
function useProviderIssue() {
  const i18n = useI18n();
  return (type: WebProviderType | undefined): { tone: StatusTone; label: string } | null =>
    type ? null : { tone: "error", label: i18n.text(messages.unavailable) };
}
export function WebProvidersSettings() {
  const i18n = useI18n(), island = useIsland();
  const capabilities = useCapabilities(), issueOf = useProviderIssue();
  const { snapshot } = useSettingsConfiguration(), action = useConfigurationAction("toast");
  const types = snapshot?.webProviderTypes ?? [];
  const states = snapshot?.webProviders ?? [];
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const latestOrder = useRef<string[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const ordered = draftOrder ? draftOrder.flatMap(id => states.filter(state => state.id === id)) : states;
  const busy = action.busy || dragging;
  const saveOrder = async (ids: string[]) => {
    try {
      if (ids.some((id, index) => id !== states[index]?.id))
        await action.run({ type: "webProvider.reorder", ids });
    } finally {
      latestOrder.current = null;
      setDraftOrder(null);
    }
  };
  const move = (index: number, offset: number) => {
    const ids = ordered.map(state => state.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + offset, 0, id!);
    setDraftOrder(ids);
    void saveOrder(ids);
  };
  const open = (id: string | null, origin: HTMLElement) => island.open({
    key: webProviderIslandKey(id), label: id === null ? messages.add : messages.edit, width: panelIslandWidth, origin,
    render: () => id === null ? <WebProviderCreation /> : <WebProviderEditor key={id} typeId={id} />,
  });
  return <Section title={i18n.text(messages.title)} hint={i18n.text(messages.hint)}
    action={<Button size="sm" disabled={!snapshot || !types.length || busy} onClick={event => open(null, event.currentTarget)}>
      <Plus />{i18n.text(messages.add)}</Button>}>
    {snapshot && !states.length ? <Empty className="surface-group">
      <EmptyHeader><EmptyMedia variant="icon"><Globe /></EmptyMedia><EmptyDescription>{i18n.text(messages.empty)}</EmptyDescription></EmptyHeader>
      {types.length > 0 && <EmptyContent><Button size="sm" variant="outline" onClick={event => open(null, event.currentTarget)}>
        <Plus />{i18n.text(messages.addFirst)}</Button></EmptyContent>}
    </Empty> : snapshot && <Reorder.Group as="div" axis="y" values={ordered.map(state => state.id)} onReorder={ids => {
      latestOrder.current = ids;
      setDraftOrder(ids);
    }}>
      <ItemGroup className="surface-group overflow-clip">{ordered.map((state, index) => {
        const type = types.find(type => type.id === state.id);
        const label = type ? i18n.text(type.label) : state.id;
        const issue = issueOf(type);
        const moveUpLabel = i18n.formatMessage(messages.moveUp, { provider: label });
        const moveDownLabel = i18n.formatMessage(messages.moveDown, { provider: label });
        return <SortableProvider key={state.id} id={state.id} label={label} rank={index + 1} reorderable={states.length > 1} disabled={action.busy}
          onDragStart={() => setDragging(true)} onDragEnd={() => {
            setDragging(false);
            void saveOrder(latestOrder.current ?? states.map(item => item.id));
          }}>
          {handle => <>
            {index > 0 && <ItemSeparator />}
            <ListRow leadingActions={handle} className="rounded-none" disabled={busy} inactive={!state.enabled}
              media={<ProviderMark name={label} iconId={type?.iconId} />}
              title={label} description={type && <Capabilities type={type} />}
              selected={island.has(webProviderIslandKey(state.id))} onOpen={origin => open(state.id, origin)}
              trailing={issue && <StatusBadge tone={issue.tone}>{issue.label}</StatusBadge>}
              actions={<>
                {ordered.length > 1 && <>
                  <ListRowAction disabled={busy || index === 0} aria-label={moveUpLabel} onClick={() => move(index, -1)}><ArrowUp /></ListRowAction>
                  <ListRowAction disabled={busy || index === ordered.length - 1} aria-label={moveDownLabel} onClick={() => move(index, 1)}><ArrowDown /></ListRowAction>
                </>}
                {/* Saving validates against the type declaration, so unavailable types cannot be toggled. */}
                <Switch aria-label={i18n.formatMessage(messages.enableProvider, { provider: label })} checked={state.enabled} disabled={busy || !type}
                  onCheckedChange={enabled => void action.run({ type: "webProvider.save", id: state.id, enabled,
                    settings: settingValues(type?.settings, state.settings) })} />
              </>} />
          </>}
        </SortableProvider>;
      })}</ItemGroup>
    </Reorder.Group>}
  </Section>;
}

/**
 * The leading slot shows the provider's place in the trial order. A reorderable list turns the rank into a drag handle on
 * row hover; keyboard users move providers with the row's arrow actions. The list item itself conveys position to assistive technology.
 */
function SortableProvider({ id, label, rank, reorderable, disabled, onDragStart, onDragEnd, children }: {
  id: string; label: string; rank: number; reorderable: boolean; disabled: boolean; onDragStart: () => void; onDragEnd: () => void;
  children: (handle: ReactNode) => ReactNode;
}) {
  const controls = useDragControls(), i18n = useI18n();
  const dragLabel = i18n.formatMessage(messages.reorder, { provider: label });
  const number = <span aria-hidden="true" className={cn("text-xs font-medium tabular-nums", reorderable && "group-hover/list-row:hidden")}>{rank}</span>;
  return <Reorder.Item as="div" role="listitem" value={id} className="relative bg-card-shell" dragListener={false} dragControls={controls}
    onDragStart={onDragStart} onDragEnd={onDragEnd}>
    {children(reorderable
      ? <IconButton variant="ghost" size="icon-xs" tabIndex={-1} label={dragLabel} disabled={disabled}
        className="touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
        onPointerDown={event => { if (!disabled) controls.start(event); }}>
        {number}<GripVertical className="hidden group-hover/list-row:block" />
      </IconButton>
      : <span className="flex size-6 items-center justify-center text-muted-foreground">{number}</span>)}
  </Reorder.Item>;
}

/* ---------- Service selection: every registered service; each can be added once ---------- */

function WebProviderCreation() {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  const [picked, setPicked] = useState<string | null>(null);
  const island = useIsland();
  useIslandCancel(picked ? null : async () => { await island.close(); });
  if (picked) return <WebProviderEditor typeId={picked} />;
  const types = snapshot?.webProviderTypes ?? [];
  const added = new Set((snapshot?.webProviders ?? []).map(state => state.id));
  const choices = types.map(type => {
    const label = i18n.text(type.label), exists = added.has(type.id);
    return { key: type.id, name: label, description: <Capabilities type={type} />, disabled: exists,
      mark: <ProviderMark name={label} iconId={type.iconId} />,
      note: exists ? i18n.text(messages.added) : undefined,
      onPick: () => setPicked(type.id) };
  });
  return <ServicePicker title={i18n.text(messages.add)} hint={i18n.text(messages.pickerHint)} groups={[{ key: "all", choices }]} />;
}

/** Read-only routing fact for fetch-capable services. */
function FetchScope({ patterns }: { patterns: readonly string[] }) {
  const i18n = useI18n();
  return <Field>
    <FieldLabel asChild><span>{i18n.text(messages.fetchScope)}</span></FieldLabel>
    {patterns.includes("*") ? <p className="type-body">{i18n.text(messages.allUrls)}</p>
      : <ul className="flex flex-wrap gap-1.5">{patterns.map(pattern => <li key={pattern}>
        <code className="surface-tint block break-all rounded-sm px-2 py-0.5 font-mono text-xs">{pattern}</code></li>)}</ul>}
    <FieldDescription>{i18n.text(messages.fetchScopeHint)}</FieldDescription>
  </Field>;
}

function WebProviderEditor({ typeId }: { typeId: string }) {
  const i18n = useI18n(), island = useIsland(), capabilities = useCapabilities(), form = useId();
  useIslandCancel(async () => { await island.close(); });
  const { snapshot } = useSettingsConfiguration();
  const type = snapshot?.webProviderTypes.find(type => type.id === typeId);
  const saved = snapshot?.webProviders.find(state => state.id === typeId) ?? null;
  // Picking a service keeps the creation key until this editor has a stored entry.
  const [id, setId] = useState(saved?.id ?? null);
  useIslandKey(webProviderIslandKey(id));
  const [values, setValues] = useState(() => settingValues(type?.settings, saved?.settings ?? {}));
  const action = useConfigurationAction("inline");
  const savedValues = settingValues(type?.settings, saved?.settings ?? {});
  const dirty = !saved || Object.entries(values).some(([key, value]) => savedValues[key] !== value);
  const complete = !!type && settingsComplete(type.settings, values);
  const label = type ? i18n.text(type.label) : typeId;
  return <Editor title={saved ? label : i18n.formatMessage(providersMessages.newServiceConnection, { service: label })}
    description={type ? capabilities(type) : i18n.text(messages.unavailable)}
    form={form} dirty={dirty} busy={action.busy} error={action.error} saveDisabled={!complete}
    remove={saved ? { title: i18n.text(messages.remove), description: i18n.text(messages.removeHint), onConfirm: async () => {
      if (await action.run({ type: "remove", kind: "webProvider", id: saved.id })) void island.close({ force: true });
    } } : undefined}>
    <form id={form} onSubmit={async event => {
      event.preventDefault();
      if (!type || !complete) return;
      // Enablement is an immediate list action; saving keeps the current value and new services start enabled.
      const result = await action.run({ type: "webProvider.save", id: typeId, enabled: saved?.enabled ?? true, settings: values });
      if (result?.ok) {
        const persisted = result.snapshot.webProviders.find(state => state.id === result.savedId);
        if (persisted) {
          setValues(settingValues(type.settings, persisted.settings));
          setId(persisted.id);
        }
      }
    }}><fieldset disabled={action.busy} className="flex flex-col gap-6">
      {!type && <p className="type-body text-muted-foreground">{i18n.text(messages.unavailableHint)}</p>}
      {type && <ProviderSettingFields settings={type.settings} values={values}
        onValue={(key, value) => setValues(current => ({ ...current, [key]: value }))} />}
      {type?.fetch && <FetchScope patterns={type.urlPatterns} />}
    </fieldset></form>
  </Editor>;
}
