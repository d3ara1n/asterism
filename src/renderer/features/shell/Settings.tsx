import { useEffect, useId, useRef, useState } from "react";
import { CopyPlus, RefreshCw, Trash2 } from "lucide-react";
import { IslandPanel, useI18n, useRendererCalls, useRendererIsland } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Input } from "@asterism-app/ui/ui/input";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { Label } from "@asterism-app/ui/ui/label";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@asterism-app/ui/ui/item";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { shellMessages as messages } from "@asterism-app/ui/messages/shell";
import { useSettingsConfiguration, useConfigurationAction } from "../configuration/state";
import { PluginIslandProvider } from "../plugins/scope";
import { defaultShellSettings } from "@asterism-app/sdk/contracts";
import { ReadShellProfiles, shellPresets, shellSettingsSchema, type ShellSettings as Settings, type ShellProfile, type ShellProfileList } from "@asterism-app/sdk/contracts";

/** Profile being edited; environment variables retain their raw text and are parsed on save. */
interface Draft { profile: ShellProfile; env: string }

const environmentText = (env: Record<string, string>) => Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n");
const draftOf = (profile: ShellProfile): Draft => ({ profile: structuredClone(profile), env: environmentText(profile.env) });
const islandKey = (id: string) => `shell:${id}`;

/** Default Shell, duplication, removal, and preset addition save immediately; clicking a profile edits it in an island to the right, and newly added profiles open immediately. */
export function ShellSettings({ value, disabled, save }: {
  value: Settings; disabled: boolean; save(value: Settings): Promise<boolean>;
}) {
  const i18n = useI18n(), island = useRendererIsland(), calls = useRendererCalls();
  const [editingId, setEditingId] = useState<string | null>(null);
  const presetTrigger = useRef<HTMLButtonElement>(null);
  const [discovery, setDiscovery] = useState<ShellProfileList | null>(null);
  const [discoveryFailed, setDiscoveryFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setDiscovery(null); setDiscoveryFailed(false);
    void calls.invoke(ReadShellProfiles, {}, { signal: controller.signal }).then(
      result => { if (!controller.signal.aborted) setDiscovery(result); },
      () => { if (!controller.signal.aborted) setDiscoveryFailed(true); },
    );
    return () => controller.abort();
  }, [calls, attempt]);
  const checking = !discovery && !discoveryFailed;
  const open = async (profile: ShellProfile, origin?: HTMLElement | null) => {
    const opened = await island.open({ key: islandKey(profile.id), label: messages.profile, origin,
      render: () => <ShellProfileEditor id={profile.id} initial={profile} onSaved={setEditingId} /> });
    if (opened) setEditingId(profile.id);
    return opened;
  };
  const commit = (next: Settings) => {
    const parsed = shellSettingsSchema.safeParse(next);
    return parsed.success ? save(parsed.data) : Promise.resolve(false);
  };
  const append = async (profile: ShellProfile, origin?: HTMLElement | null) => {
    let id = profile.id;
    for (let suffix = 2; value.profiles.some(item => item.id === id); suffix++) id = `${profile.id}-${suffix}`;
    const added = { ...structuredClone(profile), id };
    if (await commit({ ...value, profiles: [...value.profiles, added] })) void open(added, origin);
  };
  // After removal, the island editing that profile closes itself.
  const remove = (target: string) => {
    void commit({ profiles: value.profiles.filter(item => item.id !== target), selected: value.selected === target ? "auto" : value.selected });
  };
  const preview = (item: ShellProfile) =>
    [item.executable, ...item.args, ...item.commandArgs].filter(Boolean).join(" ") + ` ${i18n.text(messages.command)}`;
  const row = (saved: ShellProfile) => {
    const installedPath = discovery?.profiles.find(item => item.id === saved.id)?.resolvedExecutable;
    return <div key={saved.id} role="listitem">
      <ListRow selected={!!island.child && editingId === saved.id} onOpen={origin => { void open(saved, origin); }}
        title={<>{saved.id}{value.selected === saved.id && <Badge variant="secondary">{i18n.text(messages.isDefault)}</Badge>}</>}
        description={<span className="font-mono text-xs">{preview(saved)}</span>}
        details={installedPath && <span className="flex min-w-0 items-center gap-2">
          <Badge variant="success">{i18n.text(messages.installed)}</Badge>
          <span className="truncate font-mono" title={installedPath}>{installedPath}</span>
        </span>}
        actions={<>
          <IconButton label={i18n.text(messages.add)} disabled={disabled} onClick={event => { void append(saved, event.currentTarget); }}><CopyPlus /></IconButton>
          <IconButton label={i18n.text(messages.remove)} disabled={disabled} onClick={() => remove(saved.id)}><Trash2 /></IconButton>
        </>} />
    </div>;
  };

  const selectedLabel = i18n.text(messages.selected);
  return <div className="flex flex-col gap-4">
    <p className="type-caption">{i18n.text(messages.description)}</p>
    {discoveryFailed && <Alert variant="destructive"><AlertDescription>{i18n.text(messages.checkFailed)}</AlertDescription></Alert>}
    <ItemGroup className="surface">
      <Item>
        <ItemContent>
          <ItemTitle>{selectedLabel}</ItemTitle>
          <ItemDescription>{i18n.text(messages.selectedDescription)}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Select value={value.selected} disabled={disabled} onValueChange={selected => { void commit({ ...value, selected }); }}>
            <SelectTrigger aria-label={selectedLabel} className="min-w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="auto">{i18n.text(messages.auto)}</SelectItem>
                {value.profiles.map(item => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </ItemActions>
      </Item>
    </ItemGroup>
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="type-label">{i18n.text(messages.profiles)}</h4>
        <div className="flex items-center gap-2">
          <IconButton label={i18n.text(messages.refreshAvailability)} disabled={checking} aria-busy={checking}
            onClick={() => setAttempt(current => current + 1)}>{checking ? <Spinner /> : <RefreshCw />}</IconButton>
          <Select value="" disabled={disabled} onValueChange={preset => { void append(shellPresets.find(item => item.id === preset)!, presetTrigger.current); }}>
            <SelectTrigger ref={presetTrigger} size="sm" aria-label={i18n.text(messages.preset)}><SelectValue placeholder={i18n.text(messages.preset)} /></SelectTrigger>
            <SelectContent align="end"><SelectGroup>{shellPresets.map(item => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </div>
      </div>
      {value.profiles.length > 0 && <ItemGroup className="surface">
        {value.profiles.flatMap((item, index) => index ? [<ItemSeparator key={`${item.id}-separator`} />, row(item)] : [row(item)])}
      </ItemGroup>}
    </div>
  </div>;
}

/**
 * Profile editor island: reads the current configuration, stays open after saving, and uses the saved result as its new baseline; the island's close button closes it.
 * Closes the island if the profile is removed elsewhere (for example, by restoring defaults).
 */
function ShellProfileEditor({ id: initialId, initial, onSaved }: { id: string; initial: ShellProfile; onSaved(id: string): void }) {
  const i18n = useI18n(), island = useRendererIsland(), fieldId = useId();
  const [id, setId] = useState(initialId);
  const config = useShellConfiguration();
  const saved = config.value.profiles.find(item => item.id === id);
  const [baseline, setBaseline] = useState(() => draftOf(saved ?? initial));
  const [draft, setDraft] = useState(baseline);
  const [invalid, setInvalid] = useState(false);
  const seen = useRef(false);
  useEffect(() => {
    if (saved) seen.current = true;
    else if (seen.current && !config.busy) void island.close({ force: true });
  }, [saved, island, config.busy]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const disabled = config.busy;

  const submit = async () => {
    if (!dirty || disabled) return;
    const entries: [string, string][] = [];
    for (const line of draft.env.split("\n").filter(Boolean)) {
      const equals = line.indexOf("=");
      if (equals < 1) { setInvalid(true); return; }
      entries.push([line.slice(0, equals), line.slice(equals + 1)]);
    }
    const { profile } = draft;
    const edited = { ...profile, id: profile.id.trim(), args: profile.args.filter(Boolean), commandArgs: profile.commandArgs.filter(Boolean), env: Object.fromEntries(entries) };
    const current = config.value;
    const profiles = current.profiles.some(item => item.id === id)
      ? current.profiles.map(item => item.id === id ? edited : item)
      : [...current.profiles, edited];
    const next = shellSettingsSchema.safeParse({ ...current, profiles,
      selected: current.selected === id ? edited.id : current.selected });
    if (!next.success) { setInvalid(true); return; }
    setInvalid(false);
    if (!await config.save(next.data)) return;
    const persisted = next.data.profiles.find(item => item.id === edited.id)!;
    setId(persisted.id);
    onSaved(persisted.id);
    const normalized = draftOf(persisted);
    setBaseline(normalized); setDraft(normalized);
  };

  const update = (patch: Partial<ShellProfile>) => setDraft(current => ({ ...current, profile: { ...current.profile, ...patch } }));
  const field = (key: "id" | "executable" | "args" | "commandArgs") => {
    const control = `${fieldId}-${key}`, item = draft.profile;
    return <div className="flex flex-col gap-2">
      <Label htmlFor={control}>{i18n.text(messages[key])}</Label>
      {key === "id" || key === "executable"
        ? <Input id={control} disabled={disabled} value={item[key]}
          {...(key === "id" ? { required: true, maxLength: 160, pattern: "[a-z0-9]+((_|-)[a-z0-9]+)*", className: "font-mono" } : {})}
          onChange={event => update({ [key]: event.target.value })} />
        : <Textarea id={control} disabled={disabled} rows={2} className="font-mono" value={item[key].join("\n")}
          placeholder={i18n.text(key === "args" ? messages.argsPlaceholder : messages.commandArgsPlaceholder)}
          onChange={event => update({ [key]: event.target.value ? event.target.value.split("\n") : [] })} />}
    </div>;
  };
  const form = `${fieldId}-form`;
  return <IslandPanel title={(saved ?? initial).id} description={i18n.text(messages.profile)} dirty={dirty}
    action={<Button type="submit" form={form} size="sm" disabled={disabled || !dirty} aria-busy={config.busy}>{config.busy && <Spinner />}{i18n.text(messages.save)}</Button>}>
    <form id={form} className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
      {field("id")}{field("executable")}{field("args")}{field("commandArgs")}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${fieldId}-env`}>{i18n.text(messages.env)}</Label>
        <Textarea id={`${fieldId}-env`} rows={3} className="font-mono" disabled={disabled} value={draft.env} placeholder={i18n.text(messages.envPlaceholder)}
          onChange={event => setDraft(current => ({ ...current, env: event.target.value }))} />
      </div>
      {invalid && <p role="alert" className="type-caption text-destructive">{i18n.text(messages.invalid)}</p>}
      {config.error && <p role="alert" className="type-caption text-destructive">{i18n.text(config.error)}</p>}
    </form>
  </IslandPanel>;
}

/** Rendered only below a loaded configuration snapshot. */
function useShellConfiguration() {
  const { snapshot } = useSettingsConfiguration();
  const action = useConfigurationAction("inline");
  if (!snapshot) throw new Error("Shell settings render after the configuration snapshot loads.");
  return { value: snapshot.shell, error: action.error, busy: action.busy,
    save: async (value: Settings) => !!await action.run({ type: "shell.set", value }) };
}
function ShellSettingsBody() {
  const config = useShellConfiguration(), i18n = useI18n();
  return <div className="flex flex-col gap-6">
    <div className="flex justify-end"><Button size="sm" variant="outline" disabled={config.busy}
      onClick={() => { void config.save(defaultShellSettings); }}>{i18n.text(messages.reset)}</Button></div>
    {config.error && <Alert variant="destructive"><AlertDescription>{i18n.text(config.error)}</AlertDescription></Alert>}
    <ShellSettings value={config.value} disabled={config.busy} save={config.save} />
  </div>;
}
/** The settings page shows the shared read status; the body waits for the snapshot. */
export function ShellSettingsPage() {
  const { snapshot } = useSettingsConfiguration();
  return snapshot && <PluginIslandProvider pluginId="asterism.host" page><ShellSettingsBody /></PluginIslandProvider>;
}
