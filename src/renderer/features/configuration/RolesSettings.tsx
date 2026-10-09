import { useState } from "react";
import { Plus } from "lucide-react";
import type { ConfigurationSnapshot, ModelRole, ModelRoleOverrides, ThinkingLevel } from "../../../shared/configuration";
import { thinkingSchema } from "../../../shared/configuration";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "../../shared/ui/item";
import { Badge } from "../../shared/ui/badge";
import { Switch } from "../../shared/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { cn } from "../../shared/utils";
import { Section } from "../settings/preview";
import { Button } from "../../shared/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../../shared/ui/field";
import { useIsland } from "../../shared/weave/Screen";
import { Editor, OverrideToggleField, TextField } from "./forms";
import { s, useSettingsConfiguration } from "./state";

const FOLLOW = "__follow";
const thinkingLabel = (level: ThinkingLevel) => ({ off: s("Off", "关闭"), minimal: s("Minimal", "极低"), low: s("Low", "低"), medium: s("Medium", "中"), high: s("High", "高"), xhigh: s("Extra high", "极高") })[level];
/** 角色值等于内置值时撤下覆盖，界面只显示生效值。 */
const toOverride = <T,>(next: T, inherited: T): T | undefined => next === inherited ? undefined : next;

/** 行内模型选择：唯一的“跟随对话”项表示 null；失效引用单独警示。 */
function ModelSelect({ value, onChange, disabled }: { value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const { snapshot } = useSettingsConfiguration();
  if (!snapshot) return null;
  const missing = value !== null && !snapshot.models.some(model => model.id === value);
  return <Select value={value ?? FOLLOW} disabled={disabled} onValueChange={next => onChange(next === FOLLOW ? null : next)}>
    <SelectTrigger size="sm" className={cn("w-48", missing && "text-destructive")} aria-label={s("Model", "模型")}><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value={FOLLOW}>{s("Follow conversation", "跟随对话")}</SelectItem>
      {missing && <SelectItem value={value} disabled>{s("Unavailable model", "不可用的模型")}</SelectItem>}
      {snapshot.providers.map(provider => {
        const models = snapshot.models.filter(model => model.providerId === provider.id);
        if (!models.length) return null;
        return <SelectGroup key={provider.id}><SelectSeparator /><SelectLabel>{provider.name}</SelectLabel>
          {models.map(model => <SelectItem key={model.id} value={model.id} className={cn(!(model.enabled && provider.enabled) && "text-muted-foreground")}>
            {model.name}{model.enabled && provider.enabled ? "" : s(" (disabled)", "（已停用）")}</SelectItem>)}
        </SelectGroup>;
      })}
    </SelectContent>
  </Select>;
}
function ThinkingSelect({ value, onChange, disabled }: { value: ThinkingLevel | null; onChange: (value: ThinkingLevel | null) => void; disabled?: boolean }) {
  return <Select value={value ?? FOLLOW} disabled={disabled} onValueChange={next => onChange(next === FOLLOW ? null : next as ThinkingLevel)}>
    <SelectTrigger size="sm" className="w-32" aria-label={s("Thinking level", "思考等级")}><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value={FOLLOW}>{s("Follow conversation", "跟随对话")}</SelectItem>
      <SelectSeparator />
      {thinkingSchema.options.map(level => <SelectItem key={level} value={level}>{thinkingLabel(level)}</SelectItem>)}
    </SelectContent>
  </Select>;
}

export function RolesSettings() {
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null, origin?: HTMLElement | null) => island.open({ id: `role-${id ?? "new"}`, label: s("Model role", "模型角色"), width: { min: 400, grow: 1, max: 620 }, origin,
    render: () => <RoleEditor key={id ?? "new"} initialId={id} /> });
  // 行内修改即时保存：在现有覆盖上替换单个字段，与内置值相同则撤下。
  const patch = <K extends keyof ModelRoleOverrides>(role: ModelRole, field: K, next: ModelRoleOverrides[K]) => {
    if (!snapshot) return;
    const base = snapshot.defaults.roles[role.builtin ? role.id : "default"]!;
    const overrides = { ...snapshot.overrides.roles[role.id] };
    const value = toOverride(next, base[field as keyof typeof base] as ModelRoleOverrides[K]);
    if (value === undefined) delete overrides[field]; else overrides[field] = value;
    if (!role.builtin) overrides.name ??= role.name;
    void run({ type: "role.save", id: role.id, value: overrides });
  };
  const roles = snapshot?.roles ?? [];
  return <Section title={s("Model roles", "模型角色")} hint={s("Reusable model choices for agents and features. “Follow conversation” uses the model of the calling conversation.", "供代理与功能复用的模型选择；“跟随对话”使用发起调用的对话所选模型。")}
    action={<Button size="sm" disabled={!snapshot} onClick={event => open(null, event.currentTarget)}><Plus />{s("Add role", "添加角色")}</Button>}>
    {snapshot && <ItemGroup className="surface">{roles.map((role, index) => {
      const selected = island.child === `role-${role.id}`;
      return <div key={role.id}>{index > 0 && <ItemSeparator />}<Item size="sm" className={cn("relative flex-wrap transition-colors hover:bg-accent/60 has-[button:focus-visible]:bg-accent/60", selected && "bg-accent hover:bg-accent", !role.enabled && "opacity-70")}>
        <ItemContent className="min-w-40">
          <button type="button" className="text-left outline-none after:absolute after:inset-0 focus-visible:underline" aria-current={selected || undefined}
            onClick={event => open(role.id, event.currentTarget)}><ItemTitle>{role.name}{role.hidden && <Badge variant="secondary">{s("Internal", "内部")}</Badge>}</ItemTitle></button>
          <ItemDescription className="truncate">{role.description}</ItemDescription>
        </ItemContent>
        <ItemActions className="relative">
          <ModelSelect value={role.modelId} disabled={busy} onChange={next => patch(role, "modelId", next)} />
          <ThinkingSelect value={role.thinking} disabled={busy} onChange={next => patch(role, "thinking", next)} />
          <Switch aria-label={s(`Enable ${role.name}`, `启用 ${role.name}`)} checked={role.enabled} disabled={busy} onCheckedChange={next => patch(role, "enabled", next)} />
        </ItemActions>
      </Item></div>;
    })}</ItemGroup>}
  </Section>;
}
/** 详情只放低频字段；模型、思考与启用是行内即时操作，草稿不持有，避免互相覆盖。 */
function RoleEditor({ initialId }: { initialId: string | null }) {
  const { snapshot, run } = useSettingsConfiguration();
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const current = snapshot?.roles.find(role => role.id === id);
  const stored = id ? snapshot?.overrides.roles[id] ?? {} : {};
  const pick = (overrides: ModelRoleOverrides) => ({ name: overrides.name, description: overrides.description, hidden: overrides.hidden });
  const [value, setValue] = useState(() => pick(stored));
  const base = snapshot?.defaults.roles[current?.builtin ? current.id : "default"];
  if (!base || !snapshot) return null;
  const dirty = JSON.stringify(pick(stored)) !== JSON.stringify(value);
  const users = current ? snapshot.agents.filter(agent => agent.modelRole === current.id || agent.fallbackRole === current.id) : [];
  return <Editor form="role-form" title={current?.name ?? s("New role", "新角色")} description={current?.builtin ? s("Built-in role", "内置角色") : undefined} dirty={dirty}
    remove={current && !current.builtin ? { title: s("Delete this role?", "删除此角色？"),
      description: s(`“${current.name}” will be removed. Agents that reference it will fail until they choose another role.`, `将移除「${current.name}」。引用它的代理在改选其他角色前无法执行。`),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "role", id: current.id }); if (result.ok) void island.close({ force: true }); } } : undefined}>
    <form id="role-form" onSubmit={async event => {
      event.preventDefault();
      const latest = id ? snapshot.overrides.roles[id] ?? {} : {};
      const next: ModelRoleOverrides = { ...latest };
      for (const field of ["name", "description", "hidden"] as const) { if (value[field] === undefined) delete next[field]; else (next as Record<string, unknown>)[field] = value[field]; }
      const result = await run({ type: "role.save", id, value: next });
      if (result.ok && result.savedId) { setId(result.savedId); setValue(pick(result.snapshot.overrides.roles[result.savedId]!)); }
    }}><FieldGroup>
      <TextField label={s("Name", "名称")} value={value.name ?? ""} placeholder={current?.builtin ? base.name : undefined} onChange={next => setValue(v => ({ ...v, name: next || undefined }))} required={!current?.builtin} />
      <TextField label={s("Purpose", "用途描述")} value={value.description ?? ""} placeholder={base.description} onChange={next => setValue(v => ({ ...v, description: next || undefined }))} multiline
        hint={current?.builtin ? s("Leave blank to use the built-in text.", "留空使用内置文本。") : undefined} />
      <OverrideToggleField label={s("Available to agents", "向代理开放")} hint={s("Agents may pick this role on their own. Internal features can use it either way.", "代理可自主选用此角色；内部功能不受此项影响。")}
        value={value.hidden === undefined ? undefined : !value.hidden} inherited={!base.hidden} onChange={next => setValue(v => ({ ...v, hidden: next === undefined ? undefined : !next }))} />
      {current && <Field><FieldLabel>{s("Used by", "被引用")}</FieldLabel>
        {users.length ? <ul className="flex flex-wrap gap-1.5" aria-label={s("Agents using this role", "引用此角色的代理")}>
          {users.map(agent => <li key={agent.id}><Badge variant="secondary" className="gap-1">
            {agent.name}
            {agent.modelRole !== current.id && <span className="text-muted-foreground">· {s("Fallback", "备用")}</span>}
          </Badge></li>)}
        </ul> : <FieldDescription>{s("No agents reference this role.", "没有代理引用此角色。")}</FieldDescription>}
      </Field>}
    </FieldGroup></form>
    {!current && <p className="type-caption mt-4">{s("Choose the model and thinking level in the list after saving.", "保存后在列表中选择模型与思考等级。")}</p>}
  </Editor>;
}
