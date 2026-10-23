import { useEffect, useId, useRef, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { IslandPanel, useI18n, useRendererConfiguration, useRendererIsland } from "@atelier/sdk/renderer";
import type { UiText } from "@atelier/sdk/contracts";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { Input } from "@atelier/ui/ui/input";
import { Textarea } from "@atelier/ui/ui/textarea";
import { Label } from "@atelier/ui/ui/label";
import { Badge } from "@atelier/ui/ui/badge";
import { Spinner } from "@atelier/ui/ui/spinner";
import { ListRow } from "@atelier/ui/ui/list-row";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@atelier/ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@atelier/ui/ui/select";
import { shellMessages as messages } from "../messages/shell";
import { BuiltinSettings, settingsMessages } from "../settings/contract";
import { shellPresets, shellSettingsSchema, type ShellSettings as Settings, type ShellProfile } from "./contract";

/** 编辑中的 profile；环境变量保留原始文本，保存时再解析。 */
interface Draft { profile: ShellProfile; env: string }

const environmentText = (env: Record<string, string>) => Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n");
const draftOf = (profile: ShellProfile): Draft => ({ profile: structuredClone(profile), env: environmentText(profile.env) });
const islandKey = (id: string) => `shell:${id}`;

/** 默认 Shell、复制、移除与预设添加即时保存；点击 profile 在右侧浮岛中编辑，新增的 profile 随即打开。 */
export function ShellSettings({ value, disabled, save }: {
  value: Settings; disabled: boolean; save(value: Settings): Promise<boolean>;
}) {
  const i18n = useI18n(), island = useRendererIsland();
  const [editingId, setEditingId] = useState<string | null>(null);
  const presetTrigger = useRef<HTMLButtonElement>(null);
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
  // 移除后，编辑该 profile 的浮岛自行关闭。
  const remove = (target: string) => {
    void commit({ profiles: value.profiles.filter(item => item.id !== target), selected: value.selected === target ? "auto" : value.selected });
  };
  const preview = (item: ShellProfile) =>
    [item.executable, ...item.args, ...item.commandArgs].filter(Boolean).join(" ") + ` ${i18n.text(messages.command)}`;
  const row = (saved: ShellProfile) => <div key={saved.id} role="listitem">
    <ListRow selected={!!island.child && editingId === saved.id} onOpen={origin => { void open(saved, origin); }}
      title={<>{saved.id}{value.selected === saved.id && <Badge variant="secondary">{i18n.text(messages.isDefault)}</Badge>}</>}
      description={<span className="font-mono text-xs">{preview(saved)}</span>}
      actions={<>
        <IconButton label={i18n.text(messages.add)} disabled={disabled} onClick={event => { void append(saved, event.currentTarget); }}><Copy /></IconButton>
        <IconButton label={i18n.text(messages.remove)} disabled={disabled} onClick={() => remove(saved.id)}><Trash2 /></IconButton>
      </>} />
  </div>;

  const selectedLabel = i18n.text(messages.selected);
  return <div className="flex flex-col gap-4">
    <p className="type-caption">{i18n.text(messages.description)}</p>
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
              <SelectItem value="auto">{i18n.text(messages.auto)}</SelectItem>
              {value.profiles.map(item => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}
            </SelectContent>
          </Select>
        </ItemActions>
      </Item>
    </ItemGroup>
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="type-label">{i18n.text(messages.profiles)}</h4>
        <Select value="" disabled={disabled} onValueChange={preset => { void append(shellPresets.find(item => item.id === preset)!, presetTrigger.current); }}>
          <SelectTrigger ref={presetTrigger} size="sm" aria-label={i18n.text(messages.preset)}><SelectValue placeholder={i18n.text(messages.preset)} /></SelectTrigger>
          <SelectContent align="end">{shellPresets.map(item => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {value.profiles.length > 0 && <ItemGroup className="surface">
        {value.profiles.flatMap((item, index) => index ? [<ItemSeparator key={`${item.id}-separator`} />, row(item)] : [row(item)])}
      </ItemGroup>}
    </div>
  </div>;
}

/**
 * profile 编辑浮岛：读取当前配置，保存后保持打开并以保存结果为新的基准；关闭由浮岛的关闭按钮完成。
 * profile 在别处被移除（例如恢复默认设置）时关闭浮岛。
 */
function ShellProfileEditor({ id: initialId, initial, onSaved }: { id: string; initial: ShellProfile; onSaved(id: string): void }) {
  const i18n = useI18n(), island = useRendererIsland(), fieldId = useId();
  const [id, setId] = useState(initialId);
  const config = useRendererConfiguration(BuiltinSettings);
  const saved = config.value.shell.profiles.find(item => item.id === id);
  const [baseline, setBaseline] = useState(() => draftOf(saved ?? initial));
  const [draft, setDraft] = useState(baseline);
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<UiText | null>(null);
  const seen = useRef(false);
  useEffect(() => {
    if (saved) seen.current = true;
    else if (seen.current && !saving) void island.close({ force: true });
  }, [saved, island, saving]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const disabled = saving || !config.ready;

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
    const profiles = current.shell.profiles.some(item => item.id === id)
      ? current.shell.profiles.map(item => item.id === id ? edited : item)
      : [...current.shell.profiles, edited];
    const next = shellSettingsSchema.safeParse({ ...current.shell, profiles,
      selected: current.shell.selected === id ? edited.id : current.shell.selected });
    if (!next.success) { setInvalid(true); return; }
    setInvalid(false); setFailure(null); setSaving(true);
    try {
      await config.save({ ...current, shell: next.data });
      const persisted = next.data.profiles.find(item => item.id === edited.id)!;
      setId(persisted.id);
      onSaved(persisted.id);
      const normalized = draftOf(persisted);
      setBaseline(normalized); setDraft(normalized);
    } catch (error) {
      setFailure((error as { display?: UiText }).display ?? settingsMessages.saveFailed);
    } finally { setSaving(false); }
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
    action={<Button type="submit" form={form} size="sm" disabled={disabled || !dirty} aria-busy={saving}>{saving && <Spinner />}{i18n.text(messages.save)}</Button>}>
    <form id={form} className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
      {field("id")}{field("executable")}{field("args")}{field("commandArgs")}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${fieldId}-env`}>{i18n.text(messages.env)}</Label>
        <Textarea id={`${fieldId}-env`} rows={3} className="font-mono" disabled={disabled} value={draft.env} placeholder={i18n.text(messages.envPlaceholder)}
          onChange={event => setDraft(current => ({ ...current, env: event.target.value }))} />
      </div>
      {invalid && <p role="alert" className="type-caption text-destructive">{i18n.text(messages.invalid)}</p>}
      {failure && <p role="alert" className="type-caption text-destructive">{i18n.text(failure)}</p>}
    </form>
  </IslandPanel>;
}
