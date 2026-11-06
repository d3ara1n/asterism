import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Globe, GripVertical, Plus } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import type { ProviderSetting, WebProviderType } from "@asterism-app/sdk/contracts";
import { webProviderMessages as messages } from "../../messages/web-providers";
import { providersMessages } from "../../messages/providers";
import { useI18n } from "../../shared/i18n";
import { useIsland, useIslandCancel } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@asterism-app/ui/ui/empty";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { Item, ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Field, FieldDescription, FieldLabel } from "@asterism-app/ui/ui/field";
import { StatusBadge, type StatusTone } from "@asterism-app/ui/ui/status";
import { cn } from "@asterism-app/ui/utils";
import { Editor } from "./forms";
import { useConfigurationAction, useSettingsConfiguration } from "./state";
import { Section } from "../settings/layout";
import { ProviderKeyLink } from "./ProviderKeyLink";
import { ProviderSettingFields } from "./ProviderSettingFields";
import { settingValues, settingsComplete } from "./provider-settings";

type SecretSetting = Extract<ProviderSetting, { kind: "secret" }>;
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
const initial = (label: string) => label.trim().charAt(0).toUpperCase() || "?";

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
    id: `web-provider-${id ?? "new"}`, label: messages.edit, width: panelIslandWidth, origin,
    render: () => id === null ? <WebProviderCreation /> : <WebProviderEditor key={id} typeId={id} />,
  });
  return <Section title={i18n.text(messages.title)} hint={i18n.text(messages.hint)}
    action={<Button size="sm" disabled={!snapshot || !types.length || busy} onClick={event => open(null, event.currentTarget)}>
      <Plus />{i18n.text(messages.add)}</Button>}>
    {snapshot && !states.length ? <Empty className="border">
      <EmptyHeader><EmptyMedia variant="icon"><Globe /></EmptyMedia><EmptyDescription>{i18n.text(messages.empty)}</EmptyDescription></EmptyHeader>
      {types.length > 0 && <EmptyContent><Button size="sm" variant="outline" onClick={event => open(null, event.currentTarget)}>
        <Plus />{i18n.text(messages.addFirst)}</Button></EmptyContent>}
    </Empty> : snapshot && <Reorder.Group as="div" axis="y" values={ordered.map(state => state.id)} onReorder={ids => {
      latestOrder.current = ids;
      setDraftOrder(ids);
    }}>
      <ItemGroup className="surface overflow-clip">{ordered.map((state, index) => {
        const type = types.find(type => type.id === state.id);
        const label = type ? i18n.text(type.label) : state.id;
        const issue = issueOf(type);
        const moveUpLabel = i18n.formatMessage(messages.moveUp, { provider: label });
        const moveDownLabel = i18n.formatMessage(messages.moveDown, { provider: label });
        return <SortableProvider key={state.id} id={state.id} label={label} disabled={action.busy || states.length < 2}
          onDragStart={() => setDragging(true)} onDragEnd={() => {
            setDragging(false);
            void saveOrder(latestOrder.current ?? states.map(item => item.id));
          }}>
          {handle => <>
            {index > 0 && <ItemSeparator />}
            <ListRow leadingActions={handle} className="isolate rounded-none" disabled={busy} inactive={!state.enabled}
              mediaVariant="icon" media={<span className="text-sm font-medium text-muted-foreground">{initial(label)}</span>}
              title={label} description={type && capabilities(type)}
              selected={island.has(`web-provider-${state.id}`)} onOpen={origin => open(state.id, origin)}
              actions={<>
                {issue && <StatusBadge tone={issue.tone}>{issue.label}</StatusBadge>}
                <Button variant="ghost" size="icon-sm" disabled={busy || index === 0}
                  aria-label={moveUpLabel} title={moveUpLabel} onClick={() => move(index, -1)}><ArrowUp /></Button>
                <Button variant="ghost" size="icon-sm" disabled={busy || index === ordered.length - 1}
                  aria-label={moveDownLabel} title={moveDownLabel} onClick={() => move(index, 1)}><ArrowDown /></Button>
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

function SortableProvider({ id, label, disabled, onDragStart, onDragEnd, children }: {
  id: string; label: string; disabled: boolean; onDragStart: () => void; onDragEnd: () => void;
  children: (handle: ReactNode) => ReactNode;
}) {
  const controls = useDragControls(), i18n = useI18n();
  const dragLabel = i18n.formatMessage(messages.reorder, { provider: label });
  return <Reorder.Item as="div" role="listitem" value={id} className="relative bg-card" dragListener={false} dragControls={controls}
    onDragStart={onDragStart} onDragEnd={onDragEnd}>
    {children(<Button variant="ghost" size="icon-sm" disabled={disabled} tabIndex={-1}
      className="touch-none cursor-grab active:cursor-grabbing"
      aria-label={dragLabel} title={dragLabel}
      onPointerDown={event => { if (!disabled) controls.start(event); }}><GripVertical /></Button>)}
  </Reorder.Item>;
}

/* ---------- Service selection: every registered service, with added ones marked ---------- */

function WebProviderCreation() {
  const i18n = useI18n(), capabilities = useCapabilities();
  const { snapshot } = useSettingsConfiguration();
  const [picked, setPicked] = useState<string | null>(null);
  const island = useIsland();
  useIslandCancel(picked ? null : async () => { await island.close(); });
  if (picked) return <WebProviderEditor typeId={picked} />;
  const types = snapshot?.webProviderTypes ?? [];
  const added = new Set((snapshot?.webProviders ?? []).map(state => state.id));
  const tile = "min-h-16 flex-col items-start justify-center gap-1 px-3 py-2 text-left";
  return <Editor form="web-provider-creation" title={i18n.text(messages.add)} dirty={false} busy={false} error={null}>
    <div className="flex flex-col gap-5">
      <p className="type-caption">{i18n.text(messages.pickerHint)}</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))" }}>
        {types.map(type => {
          const exists = added.has(type.id);
          const help = type.settings.find((setting): setting is SecretSetting => setting.kind === "secret" && !!setting.helpUrl);
          return <div key={type.id} className="flex flex-col gap-1">
            <Item asChild variant="outline" className={cn(tile, "bg-card", exists ? "opacity-60" : "hover:bg-accent")}>
              <button type="button" disabled={exists} onClick={() => setPicked(type.id)}>
                <span className="flex w-full min-w-0 items-center justify-between gap-2">
                  <span className="type-section truncate">{i18n.text(type.label)}</span>
                  {exists && <Badge variant="secondary" className="font-normal">{i18n.text(messages.added)}</Badge>}
                </span>
                <span className="type-caption">{capabilities(type)}</span>
              </button>
            </Item>
            {!exists && help?.helpUrl && <ProviderKeyLink href={help.helpUrl}>{i18n.text(providersMessages.getKey)}</ProviderKeyLink>}
          </div>;
        })}
      </div>
    </div>
  </Editor>;
}

/** Read-only routing fact for fetch-capable services. */
function FetchScope({ patterns }: { patterns: readonly string[] }) {
  const i18n = useI18n();
  return <Field>
    <FieldLabel asChild><span>{i18n.text(messages.fetchScope)}</span></FieldLabel>
    {patterns.includes("*") ? <p className="type-body">{i18n.text(messages.allUrls)}</p>
      : <ul className="flex flex-wrap gap-1.5">{patterns.map(pattern => <li key={pattern}>
        <code className="block break-all rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{pattern}</code></li>)}</ul>}
    <FieldDescription>{i18n.text(messages.fetchScopeHint)}</FieldDescription>
  </Field>;
}

function WebProviderEditor({ typeId }: { typeId: string }) {
  const i18n = useI18n(), island = useIsland(), capabilities = useCapabilities();
  useIslandCancel(async () => { await island.close(); });
  const { snapshot } = useSettingsConfiguration();
  const type = snapshot?.webProviderTypes.find(type => type.id === typeId);
  const saved = snapshot?.webProviders.find(state => state.id === typeId) ?? null;
  const [values, setValues] = useState(() => settingValues(type?.settings, saved?.settings ?? {}));
  const action = useConfigurationAction("inline");
  const savedValues = settingValues(type?.settings, saved?.settings ?? {});
  const dirty = !saved || Object.entries(values).some(([key, value]) => savedValues[key] !== value);
  const complete = !!type && settingsComplete(type.settings, values);
  const label = type ? i18n.text(type.label) : typeId;
  return <Editor title={label} description={type ? capabilities(type) : i18n.text(messages.unavailable)}
    form="web-provider-editor" dirty={dirty} busy={action.busy} error={action.error} saveDisabled={!complete}
    remove={saved ? { title: i18n.text(messages.remove), description: i18n.text(messages.removeHint), onConfirm: async () => {
      if (await action.run({ type: "remove", kind: "webProvider", id: saved.id })) void island.close({ force: true });
    } } : undefined}>
    <form id="web-provider-editor" onSubmit={async event => {
      event.preventDefault();
      if (!type || !complete) return;
      // Enablement is an immediate list action; saving keeps the current value and new services start enabled.
      const result = await action.run({ type: "webProvider.save", id: typeId, enabled: saved?.enabled ?? true, settings: values });
      if (result?.ok) {
        const persisted = result.snapshot.webProviders.find(state => state.id === result.savedId);
        if (persisted) setValues(settingValues(type.settings, persisted.settings));
      }
    }}><fieldset disabled={action.busy} className="flex flex-col gap-6">
      {!type && <p className="type-body text-muted-foreground">{i18n.text(messages.unavailableHint)}</p>}
      {type && <ProviderSettingFields settings={type.settings} values={values}
        onValue={(key, value) => setValues(current => ({ ...current, [key]: value }))} />}
      {type?.fetch && <FetchScope patterns={type.urlPatterns} />}
    </fieldset></form>
  </Editor>;
}
