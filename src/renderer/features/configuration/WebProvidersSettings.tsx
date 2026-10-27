import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { webProviderMessages as messages } from "../../messages/web-providers";
import { useI18n } from "../../shared/i18n";
import { useIsland } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Button } from "@asterism-app/ui/ui/button";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Field, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { Editor, ChoiceField, ToggleField } from "./forms";
import { useConfigurationAction, useSettingsConfiguration } from "./state";
import { Section } from "../settings/layout";
import { ProviderKeyLink } from "./ProviderKeyLink";

export function WebProvidersSettings() {
  const i18n = useI18n(), island = useIsland();
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
  const unconfigured = types.filter(type => !states.some(state => state.id === type.id));
  const open = (id: string | null, origin: HTMLElement) => island.open({
    id: `web-provider-${id ?? "new"}`, label: messages.edit, width: panelIslandWidth, origin,
    render: () => <WebProviderEditor id={id} />,
  });
  return <Section title={i18n.text(messages.title)} hint={i18n.text(messages.hint)}
    action={<Button size="sm" disabled={!snapshot || !unconfigured.length || busy} onClick={event => open(null, event.currentTarget)}>
      <Plus />{i18n.text(messages.add)}</Button>}>
    {!states.length ? <p className="type-body p-3 text-muted-foreground">{i18n.text(messages.empty)}</p>
      : <Reorder.Group as="div" axis="y" values={ordered.map(state => state.id)} onReorder={ids => {
        latestOrder.current = ids;
        setDraftOrder(ids);
      }}>
        <ItemGroup className="surface overflow-clip">{ordered.map((state, index) => {
          const type = types.find(type => type.id === state.id);
          const label = type ? i18n.text(type.label) : state.id;
          const moveUpLabel = i18n.formatMessage(messages.moveUp, { provider: label });
          const moveDownLabel = i18n.formatMessage(messages.moveDown, { provider: label });
          return <SortableProvider key={state.id} id={state.id} label={label} disabled={action.busy || states.length < 2}
            onDragStart={() => setDragging(true)} onDragEnd={() => {
              setDragging(false);
              void saveOrder(latestOrder.current ?? states.map(item => item.id));
            }}>
            {handle => <>
              {index > 0 && <ItemSeparator />}
              <ListRow leadingActions={handle} title={label} disabled={busy} className="isolate rounded-none"
                description={type ? [type.search && i18n.text(messages.search), type.fetch && i18n.text(messages.fetch)].filter(Boolean).join(" · ")
                  : i18n.text(messages.unavailable)}
                selected={island.child === `web-provider-${state.id}`} onOpen={origin => open(state.id, origin)}
                actions={<>
                  <Button variant="ghost" size="icon-sm" disabled={busy || index === 0}
                    aria-label={moveUpLabel} title={moveUpLabel} onClick={() => move(index, -1)}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-sm" disabled={busy || index === ordered.length - 1}
                    aria-label={moveDownLabel} title={moveDownLabel} onClick={() => move(index, 1)}><ArrowDown /></Button>
                  <Switch aria-label={i18n.text(messages.enabled)} checked={state.enabled} disabled={busy}
                    onCheckedChange={enabled => void action.run({ type: "webProvider.save", id: state.id, enabled, credential: { action: "keep" } })} />
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
  // Existing providers can be saved when credentials or enablement change.
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
        {type.credential.keyUrl && <ProviderKeyLink href={type.credential.keyUrl}>{i18n.text(messages.keyLink)}</ProviderKeyLink>}
      </>}
    </fieldset></form>
  </Editor>;
}
