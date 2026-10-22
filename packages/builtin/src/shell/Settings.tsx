import { useEffect, useId, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { useI18n } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { Input } from "@atelier/ui/ui/input";
import { Textarea } from "@atelier/ui/ui/textarea";
import { Label } from "@atelier/ui/ui/label";
import { Badge } from "@atelier/ui/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@atelier/ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@atelier/ui/ui/select";
import { shellMessages as messages } from "../messages/shell";
import { shellPresets, shellSettingsSchema, type ShellSettings as Settings, type ShellProfile } from "./contract";

/** 单行展开编辑中的 profile；环境变量保留原始文本，完成时再解析。 */
interface Draft { profile: ShellProfile; env: string }

const environmentText = (env: Record<string, string>) => Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n");

/** 默认 Shell、复制、移除与预设添加即时保存；展开的 profile 以「完成」保存、「取消」放弃。 */
export function ShellSettings({ value, disabled, save }: {
  value: Settings; disabled: boolean; save(value: Settings): Promise<boolean>;
}) {
  const i18n = useI18n(), id = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [invalid, setInvalid] = useState(false);
  // 编辑中的 profile 被移除（例如恢复默认设置）时关闭编辑区。
  useEffect(() => {
    if (draft && !value.profiles.some(item => item.id === draft.profile.id)) { setDraft(null); setInvalid(false); }
  }, [value]);

  const open = (profile: ShellProfile) => { setDraft({ profile, env: environmentText(profile.env) }); setInvalid(false); };
  const close = () => { setDraft(null); setInvalid(false); };
  const commit = (next: Settings) => {
    const parsed = shellSettingsSchema.safeParse(next);
    return parsed.success ? save(parsed.data) : Promise.resolve(false);
  };
  const append = async (profile: ShellProfile) => {
    const added = { ...structuredClone(profile), id: crypto.randomUUID() };
    if (await commit({ ...value, profiles: [...value.profiles, added] })) open(added);
  };
  const remove = (target: string) => {
    if (draft?.profile.id === target) close();
    void commit({ profiles: value.profiles.filter(item => item.id !== target), selected: value.selected === target ? "auto" : value.selected });
  };
  const complete = async () => {
    if (!draft) return;
    const entries: [string, string][] = [];
    for (const line of draft.env.split("\n").filter(Boolean)) {
      const equals = line.indexOf("=");
      if (equals < 1) { setInvalid(true); return; }
      entries.push([line.slice(0, equals), line.slice(equals + 1)]);
    }
    const { profile } = draft;
    const edited = { ...profile, args: profile.args.filter(Boolean), commandArgs: profile.commandArgs.filter(Boolean), env: Object.fromEntries(entries) };
    const profiles = value.profiles.some(item => item.id === edited.id)
      ? value.profiles.map(item => item.id === edited.id ? edited : item)
      : [...value.profiles, edited];
    const next = shellSettingsSchema.safeParse({ ...value, profiles });
    if (!next.success) { setInvalid(true); return; }
    if (await save(next.data)) close();
  };

  const update = (patch: Partial<ShellProfile>) => setDraft(current => current && { ...current, profile: { ...current.profile, ...patch } });
  const preview = (item: ShellProfile) =>
    [item.executable, ...item.args, ...item.commandArgs].filter(Boolean).join(" ") + ` ${i18n.text(messages.command)}`;
  const field = (item: ShellProfile, key: "name" | "executable" | "args" | "commandArgs") => {
    const fieldId = `${id}-${key}`;
    return <div className="flex flex-col gap-2">
      <Label htmlFor={fieldId}>{i18n.text(messages[key])}</Label>
      {key === "name" || key === "executable"
        ? <Input id={fieldId} disabled={disabled} value={item[key]} onChange={event => update({ [key]: event.target.value })} />
        : <Textarea id={fieldId} disabled={disabled} rows={2} className="font-mono" value={item[key].join("\n")}
          onChange={event => update({ [key]: event.target.value ? event.target.value.split("\n") : [] })} />}
    </div>;
  };
  const editor = ({ profile, env }: Draft) => <div className="flex flex-col gap-3 px-4 pb-4">
    {field(profile, "name")}{field(profile, "executable")}{field(profile, "args")}{field(profile, "commandArgs")}
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-env`}>{i18n.text(messages.env)}</Label>
      <Textarea id={`${id}-env`} rows={3} className="font-mono" disabled={disabled} value={env}
        onChange={event => setDraft(current => current && { ...current, env: event.target.value })} />
    </div>
    {invalid && <p role="alert" className="type-caption text-destructive">{i18n.text(messages.invalid)}</p>}
  </div>;
  const row = (saved: ShellProfile) => {
    const editing = draft?.profile.id === saved.id ? draft : null;
    const item = editing?.profile ?? saved;
    return <div key={saved.id} role="listitem">
      <Item size="sm">
        <ItemContent className="min-w-0">
          <ItemTitle>{item.name || item.executable}
            {value.selected === saved.id && <Badge variant="secondary">{i18n.text(messages.isDefault)}</Badge>}
          </ItemTitle>
          <ItemDescription className="truncate font-mono text-xs">{preview(item)}</ItemDescription>
        </ItemContent>
        <ItemActions>
          {editing ? <>
            <Button variant="outline" size="sm" disabled={disabled} onClick={close}>{i18n.text(messages.cancel)}</Button>
            <Button size="sm" disabled={disabled} onClick={() => { void complete(); }}>{i18n.text(messages.done)}</Button>
          </> : <Button variant="ghost" size="sm" disabled={disabled} aria-expanded={false}
            onClick={() => open(structuredClone(saved))}>{i18n.text(messages.edit)}</Button>}
          <IconButton label={i18n.text(messages.add)} disabled={disabled} onClick={() => { void append(saved); }}><Copy /></IconButton>
          <IconButton label={i18n.text(messages.remove)} disabled={disabled} onClick={() => remove(saved.id)}><Trash2 /></IconButton>
        </ItemActions>
      </Item>
      {editing && editor(editing)}
    </div>;
  };

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
              {value.profiles.map(item => <SelectItem key={item.id} value={item.id}>{item.name || item.executable}</SelectItem>)}
            </SelectContent>
          </Select>
        </ItemActions>
      </Item>
    </ItemGroup>
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="type-label">{i18n.text(messages.profiles)}</h4>
        <Select value="" disabled={disabled} onValueChange={preset => { void append(shellPresets.find(item => item.id === preset)!); }}>
          <SelectTrigger size="sm" aria-label={i18n.text(messages.preset)}><SelectValue placeholder={i18n.text(messages.preset)} /></SelectTrigger>
          <SelectContent align="end">{shellPresets.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {value.profiles.length > 0 && <ItemGroup className="surface">
        {value.profiles.flatMap((item, index) => index ? [<ItemSeparator key={`${item.id}-separator`} />, row(item)] : [row(item)])}
      </ItemGroup>}
    </div>
  </div>;
}
