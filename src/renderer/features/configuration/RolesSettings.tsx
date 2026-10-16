import { Plus } from "lucide-react";
import { useState } from "react";

import { availableThinkingLevels, modelReference, type ProviderModel, type ModelRole, type ModelRoleOverrides, type ThinkingLevel } from "../../../shared/configuration";
import { rolesMessages } from "../../messages/roles";
import { modelSelectionMessages, thinkingLabels } from "@atelier/ui/messages/model-selection";
import { getI18n, useI18n } from "../../shared/i18n";
import { Badge } from "@atelier/ui/ui/badge";
import { Button } from "@atelier/ui/ui/button";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@atelier/ui/ui/field";
import { ItemGroup, ItemSeparator } from "@atelier/ui/ui/item";
import { ListRow } from "@atelier/ui/ui/list-row";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectSeparator, SelectLabel } from "@atelier/ui/ui/select";
import { Switch } from "@atelier/ui/ui/switch";
import { cn } from "@atelier/ui/utils";
import { useIsland } from "../../shared/weave/Screen";
import { Section } from "../settings/layout";
import { Editor, TextField, OverrideToggleField } from "./forms";
import { useSettingsConfiguration } from "./state";

const FOLLOW = "__follow";
const thinkingLabel = (level: ThinkingLevel) => getI18n().text(thinkingLabels[level]);
/** 角色值等于内置值时撤下覆盖，界面只显示生效值。 */
const toOverride = <T,>(next: T, inherited: T): T | undefined => next === inherited ? undefined : next;

/** 行内模型选择：唯一的“跟随对话”项表示 null；失效引用单独警示。 */
function ModelSelect({ value, onChange, disabled }: { value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  if (!snapshot) return null;
  const missing = value !== null && !snapshot.models.some(model => modelReference(model) === value);
  return <Select value={value ?? FOLLOW} disabled={disabled} onValueChange={next => onChange(next === FOLLOW ? null : next)}>
    <SelectTrigger size="sm" className="w-48" aria-invalid={missing || undefined} aria-label={i18n.formatMessage(rolesMessages.model)}><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value={FOLLOW}>{i18n.formatMessage(rolesMessages.followConversation)}</SelectItem>
      {missing && <SelectItem value={value} disabled>{i18n.formatMessage(rolesMessages.unavailableModel)}</SelectItem>}
      {snapshot.providers.map(provider => {
        const models = snapshot.models.filter(model => model.providerId === provider.id);
        if (!models.length) return null;
        return <SelectGroup key={provider.id}><SelectSeparator /><SelectLabel>{provider.name}</SelectLabel>
          {models.map(model => <SelectItem key={modelReference(model)} value={modelReference(model)} className={cn(!(model.enabled && provider.enabled) && "text-muted-foreground")}>
            {model.name}{model.enabled && provider.enabled ? "" : i18n.formatMessage(rolesMessages.disabledSuffix)}</SelectItem>)}
        </SelectGroup>;
      })}
    </SelectContent>
  </Select>;
}
function ThinkingSelect({ value, model, onChange, disabled }: { value: ThinkingLevel | null; model: ProviderModel | null; onChange: (value: ThinkingLevel | null) => void; disabled?: boolean }) {
  const i18n = useI18n();
  const levels = availableThinkingLevels(model);
  const unsupported = model?.capabilities.reasoning === false;
  const unavailable = value !== null && !levels.includes(value);
  return <Select value={value ?? FOLLOW} disabled={disabled || unsupported} onValueChange={next => onChange(next === FOLLOW ? null : next as ThinkingLevel)}>
    <SelectTrigger size="sm" className="w-32" aria-label={i18n.formatMessage(rolesMessages.thinkingLevel)}>
      <SelectValue>{unsupported ? i18n.text(modelSelectionMessages.thinkingUnsupported)
        : unavailable ? i18n.formatMessage(modelSelectionMessages.unavailable, { value: thinkingLabel(value) })
          : value === null ? i18n.text(rolesMessages.followConversationThinking) : thinkingLabel(value)}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={FOLLOW}>{i18n.formatMessage(rolesMessages.followConversationThinking)}</SelectItem>
      <SelectSeparator />
      {levels.map(level => <SelectItem key={level} value={level}>{thinkingLabel(level)}</SelectItem>)}
    </SelectContent>
  </Select>;
}

export function RolesSettings() {
  const i18n = useI18n();
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null, origin?: HTMLElement | null) => island.open({ id: `role-${id ?? "new"}`, label: rolesMessages.modelRole, width: { min: 400, grow: 1, max: 620 }, origin,
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
  return <Section title={i18n.formatMessage(rolesMessages.modelRoles)} hint={i18n.formatMessage(rolesMessages.summary)}
    action={<Button size="sm" disabled={!snapshot} onClick={event => open(null, event.currentTarget)}><Plus />{i18n.formatMessage(rolesMessages.addRole)}</Button>}>
    {snapshot && <ItemGroup className="surface">{roles.map((role, index) => {
      return <div key={role.id}>{index > 0 && <ItemSeparator />}
        <ListRow className="flex-wrap" contentClassName="min-w-40" selected={island.child === `role-${role.id}`} inactive={!role.enabled} onOpen={origin => open(role.id, origin)}
          title={<>{role.name}{role.hidden && <Badge variant="secondary">{i18n.formatMessage(rolesMessages.internal)}</Badge>}</>}
          description={role.description}
          actions={<>
            <ModelSelect value={role.model} disabled={busy} onChange={next => patch(role, "model", next)} />
            <ThinkingSelect value={role.thinking} model={snapshot.models.find(model => modelReference(model) === role.model) ?? null}
              disabled={busy} onChange={next => patch(role, "thinking", next)} />
            <Switch aria-label={i18n.formatMessage(rolesMessages.enableRole, { role_name: role.name })} checked={role.enabled} disabled={busy} onCheckedChange={next => patch(role, "enabled", next)} />
          </>} /></div>;
    })}</ItemGroup>}
  </Section>;
}
/** 详情只放低频字段；模型、思考与启用是行内即时操作，草稿不持有，避免互相覆盖。 */
function RoleEditor({ initialId }: { initialId: string | null }) {
  const i18n = useI18n();
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
  return <Editor form="role-form" title={current?.name ?? i18n.formatMessage(rolesMessages.newRole)} description={current?.builtin ? i18n.formatMessage(rolesMessages.builtinRole) : undefined} dirty={dirty}
    remove={current && !current.builtin ? { title: i18n.formatMessage(rolesMessages.deleteTitle),
      description: i18n.formatMessage(rolesMessages.deleteDescription, { current_name: current.name }),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "role", id: current.id }); if (result.ok) void island.close({ force: true }); } } : undefined}>
    <form id="role-form" onSubmit={async event => {
      event.preventDefault();
      const latest = id ? snapshot.overrides.roles[id] ?? {} : {};
      const next: ModelRoleOverrides = { ...latest };
      for (const field of ["name", "description", "hidden"] as const) { if (value[field] === undefined) delete next[field]; else (next as Record<string, unknown>)[field] = value[field]; }
      const result = await run({ type: "role.save", id, value: next });
      if (result.ok && result.savedId) { setId(result.savedId); setValue(pick(result.snapshot.overrides.roles[result.savedId]!)); }
    }}><FieldGroup>
      <TextField label={i18n.formatMessage(rolesMessages.name)} value={value.name ?? ""} placeholder={current?.builtin ? base.name : undefined} onChange={next => setValue(v => ({ ...v, name: next || undefined }))} required={!current?.builtin} />
      <TextField label={i18n.formatMessage(rolesMessages.purpose)} value={value.description ?? ""} placeholder={base.description} onChange={next => setValue(v => ({ ...v, description: next || undefined }))} multiline
        hint={current?.builtin ? i18n.formatMessage(rolesMessages.purposeHint) : undefined} />
      <OverrideToggleField label={i18n.formatMessage(rolesMessages.availableToAgents)} hint={i18n.formatMessage(rolesMessages.availableToAgentsHint)}
        value={value.hidden === undefined ? undefined : !value.hidden} inherited={!base.hidden} onChange={next => setValue(v => ({ ...v, hidden: next === undefined ? undefined : !next }))} />
      {current && <Field><FieldLabel>{i18n.formatMessage(rolesMessages.usedBy)}</FieldLabel>
        {users.length ? <ul className="flex flex-wrap gap-1.5" aria-label={i18n.formatMessage(rolesMessages.agentsUsingRole)}>
          {users.map(agent => <li key={agent.id}><Badge variant="secondary" className="gap-1">
            {agent.name}
            {agent.modelRole !== current.id && <span className="text-muted-foreground">· {i18n.formatMessage(rolesMessages.fallback)}</span>}
          </Badge></li>)}
        </ul> : <FieldDescription>{i18n.formatMessage(rolesMessages.noAgentsUsingRole)}</FieldDescription>}
      </Field>}
    </FieldGroup></form>
    {!current && <p className="type-caption mt-4">{i18n.formatMessage(rolesMessages.chooseModelHint)}</p>}
  </Editor>;
}
