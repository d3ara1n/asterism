import { useEffect, useId, useState } from "react";
import { useI18n } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { Input } from "@atelier/ui/ui/input";
import { Textarea } from "@atelier/ui/ui/textarea";
import { Label } from "@atelier/ui/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@atelier/ui/ui/select";
import { shellMessages as messages } from "../messages/shell";
import { shellPresets, shellSettingsSchema, type ShellSettings as Settings, type ShellProfile } from "./contract";

export function ShellSettings({ value, disabled, save }: {
  value: Settings; disabled: boolean; save(value: Settings): Promise<void>;
}) {
  const i18n = useI18n(), id = useId();
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(value.profiles[0]?.id ?? "");
  const [environments, setEnvironments] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState(false);
  const profile = draft.profiles.find(item => item.id === editing);
  // 宿主每次解码返回新对象；只有保存值实际变化才替换表单草稿。
  const savedValue = JSON.stringify(value);
  useEffect(() => {
    setDraft(value); setInvalid(false);
    setEnvironments({});
    if (!value.profiles.some(item => item.id === editing)) setEditing(value.profiles[0]?.id ?? "");
  }, [savedValue]);
  const environmentText = (item: ShellProfile) => environments[item.id] ?? Object.entries(item.env).map(([key, value]) => `${key}=${value}`).join("\n");
  const update = (patch: Partial<ShellProfile>) => setDraft(current => ({
    ...current, profiles: current.profiles.map(item => item.id === editing ? { ...item, ...patch } : item),
  }));
  const choose = (label: string, current: string, onChange: (value: string) => void, automatic = false) =>
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Select value={current} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {automatic && <SelectItem value="auto">{i18n.text(messages.auto)}</SelectItem>}
          {draft.profiles.map(item => <SelectItem key={item.id} value={item.id}>{item.name || item.executable}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>;
  const field = (key: "name" | "executable" | "args" | "commandArgs") => {
    const label = i18n.text(messages[key]);
    const common = { id: `${id}-${key}`, disabled };
    return <div className="flex flex-col gap-2">
      <Label htmlFor={common.id}>{label}</Label>
      {key === "name" || key === "executable"
        ? <Input {...common} value={profile![key]} onChange={event => update({ [key]: event.target.value })} />
        : <Textarea {...common} rows={2} className="font-mono" value={profile![key].join("\n")}
          onChange={event => update({ [key]: event.target.value ? event.target.value.split("\n") : [] })} />}
    </div>;
  };
  const submit = () => {
    const profiles: ShellProfile[] = [];
    for (const item of draft.profiles) {
      const entries: [string, string][] = [];
      for (const line of environmentText(item).split("\n").filter(Boolean)) {
        const equals = line.indexOf("=");
        if (equals < 1) { setInvalid(true); setEditing(item.id); return; }
        entries.push([line.slice(0, equals), line.slice(equals + 1)]);
      }
      profiles.push({ ...item, args: item.args.filter(Boolean), commandArgs: item.commandArgs.filter(Boolean), env: Object.fromEntries(entries) });
    }
    const next = shellSettingsSchema.safeParse({ ...draft, profiles });
    if (!next.success) { setInvalid(true); return; }
    setInvalid(false);
    void save(next.data);
  };
  return <div className="surface flex flex-col gap-4 p-4">
    <p className="type-caption">{i18n.text(messages.description)}</p>
    {choose(i18n.text(messages.selected), draft.selected, selected => setDraft({ ...draft, selected }), true)}
    {choose(i18n.text(messages.profile), editing, setEditing)}
    {profile && <div className="flex flex-col gap-3">
      {field("name")}{field("executable")}{field("args")}{field("commandArgs")}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-env`}>{i18n.text(messages.env)}</Label>
        <Textarea id={`${id}-env`} rows={3} className="font-mono" disabled={disabled} value={environmentText(profile)}
          onChange={event => setEnvironments({ ...environments, [profile.id]: event.target.value })} />
      </div>
    </div>}
    <div className="flex flex-wrap gap-2">
      <Select value="" disabled={disabled} onValueChange={preset => {
        const source = shellPresets.find(item => item.id === preset)!;
        const added = { ...structuredClone(source), id: crypto.randomUUID() };
        setDraft({ ...draft, profiles: [...draft.profiles, added] }); setEditing(added.id);
      }}>
        <SelectTrigger aria-label={i18n.text(messages.preset)}><SelectValue placeholder={i18n.text(messages.preset)} /></SelectTrigger>
        <SelectContent>{shellPresets.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="outline" size="sm" disabled={disabled || !profile} onClick={() => {
        const added = { ...structuredClone(profile!), id: crypto.randomUUID() };
        setEnvironments({ ...environments, [added.id]: environmentText(profile!) });
        setDraft({ ...draft, profiles: [...draft.profiles, added] }); setEditing(added.id);
      }}>{i18n.text(messages.add)}</Button>
      <Button variant="outline" size="sm" disabled={disabled || !profile} onClick={() => {
        const profiles = draft.profiles.filter(item => item.id !== editing);
        setDraft({ profiles, selected: draft.selected === editing ? "auto" : draft.selected });
        setEditing(profiles[0]?.id ?? "");
      }}>{i18n.text(messages.remove)}</Button>
    </div>
    {invalid && <p role="alert" className="type-caption text-destructive">{i18n.text(messages.invalid)}</p>}
    <div><Button size="sm" disabled={disabled} onClick={submit}>{i18n.text(messages.save)}</Button></div>
  </div>;
}
