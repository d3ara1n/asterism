import { Plus } from "lucide-react";
import { useId, useState } from "react";

import { availableThinkingLevels, modelReference, type ConfigurationSnapshot, type ProviderModel, type ModelRole, type ModelRoleOverrides, type ThinkingLevel } from "../../../shared/configuration";
import { rolesMessages } from "../../messages/roles";
import { modelSelectionMessages, thinkingLabels } from "@asterism/ui/messages/model-selection";
import { getI18n, useI18n } from "../../shared/i18n";
import { Badge } from "@asterism/ui/ui/badge";
import { Button } from "@asterism/ui/ui/button";
import { Input } from "@asterism/ui/ui/input";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@asterism/ui/ui/field";
import { ItemGroup, ItemSeparator } from "@asterism/ui/ui/item";
import { ListRow } from "@asterism/ui/ui/list-row";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectSeparator, SelectLabel } from "@asterism/ui/ui/select";
import { Switch } from "@asterism/ui/ui/switch";
import { cn } from "@asterism/ui/utils";
import { useIsland } from "../../shared/weave/Screen";
import { panelIslandWidth } from "../../shared/weave/IslandPanel";
import { Section } from "../settings/layout";
import { Editor, TextField, OverrideToggleField } from "./forms";
import { useConfigurationAction, useSettingsConfiguration } from "./state";

const UNSET = "__unset";
const thinkingLabel = (level: ThinkingLevel) => getI18n().text(thinkingLabels[level]);
/** 角色值等于内置值时撤下覆盖，界面只显示生效值。 */
const toOverride = <T,>(next: T, inherited: T): T | undefined => next === inherited ? undefined : next;

/** 行内模型选择：未设置表示 null；失效引用单独警示。 */
function ModelSelect({ value, onChange, disabled }: { value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  if (!snapshot) return null;
  const missing = value !== null && !snapshot.models.some(model => modelReference(model) === value);
  return <Select value={value ?? UNSET} disabled={disabled} onValueChange={next => onChange(next === UNSET ? null : next)}>
    <SelectTrigger size="sm" className="w-48" aria-invalid={missing || undefined} aria-label={i18n.formatMessage(rolesMessages.model)}><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value={UNSET}>{i18n.formatMessage(rolesMessages.noModel)}</SelectItem>
      {missing && <SelectItem value={value} disabled>{i18n.formatMessage(rolesMessages.unavailableModel)}</SelectItem>}
      {snapshot.modelProviders.map(provider => {
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
  return <Select value={value ?? UNSET} disabled={disabled || unsupported} onValueChange={next => onChange(next === UNSET ? null : next as ThinkingLevel)}>
    <SelectTrigger size="sm" className="w-32" aria-label={i18n.formatMessage(rolesMessages.thinkingLevel)}>
      <SelectValue>{unsupported ? i18n.text(modelSelectionMessages.thinkingUnsupported)
        : value === null ? i18n.text(modelSelectionMessages.providerDefault) : thinkingLabel(value)}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={UNSET}>{i18n.text(modelSelectionMessages.providerDefault)}</SelectItem>
      <SelectSeparator />
      {levels.map(level => <SelectItem key={level} value={level}>{thinkingLabel(level)}</SelectItem>)}
    </SelectContent>
  </Select>;
}

export function RolesSettings() {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  const island = useIsland();
  const [editingId, setEditingId] = useState<string | null>(null);
  const open = async (id: string | null, origin?: HTMLElement | null) => {
    const opened = await island.open({ id: `role-${id ?? "new"}`, label: rolesMessages.modelRole, width: panelIslandWidth, origin,
      render: () => <RoleEditor key={id ?? "new"} initialId={id} onSaved={setEditingId} /> });
    if (opened) setEditingId(id);
    return opened;
  };
  const roles = snapshot?.roles ?? [];
  return <Section title={i18n.formatMessage(rolesMessages.modelRoles)} hint={i18n.formatMessage(rolesMessages.summary)}
    action={<Button size="sm" disabled={!snapshot} onClick={event => open(null, event.currentTarget)}><Plus />{i18n.formatMessage(rolesMessages.addRole)}</Button>}>
    {snapshot && <ItemGroup className="surface">{roles.map((role, index) =>
      <div key={role.id}>{index > 0 && <ItemSeparator />}
        <RoleRow role={role} snapshot={snapshot} selected={!!island.child && editingId === role.id} onOpen={origin => open(role.id, origin)} />
      </div>)}</ItemGroup>}
  </Section>;
}

function RoleRow({ role, snapshot, selected, onOpen }: {
  role: ModelRole; snapshot: ConfigurationSnapshot; selected: boolean; onOpen: (origin: HTMLElement) => void;
}) {
  const i18n = useI18n();
  const { run, busy } = useConfigurationAction("toast");
  // 行内修改即时保存：在现有覆盖上替换单个字段，与内置值相同则撤下。
  const patch = <K extends keyof ModelRoleOverrides>(field: K, next: ModelRoleOverrides[K]) => {
    const base = snapshot.defaults.roles[role.builtin ? role.id : "default"]!;
    const overrides = { ...snapshot.overrides.roles[role.id] };
    const value = toOverride(next, base[field as keyof typeof base] as ModelRoleOverrides[K]);
    if (value === undefined) delete overrides[field]; else overrides[field] = value;
    void run({ type: "role.save", id: role.id, value: { ...overrides, id: role.id } });
  };
  return <ListRow className="flex-wrap" contentClassName="min-w-40" selected={selected} inactive={!role.enabled} onOpen={onOpen}
    title={<>{role.id}{role.hidden && <Badge variant="secondary">{i18n.formatMessage(rolesMessages.internal)}</Badge>}</>}
    description={role.description}
    actions={<>
      <ModelSelect value={role.model} disabled={busy} onChange={next => patch("model", next)} />
      <ThinkingSelect value={role.thinking} model={snapshot.models.find(model => modelReference(model) === role.model) ?? null}
        disabled={busy} onChange={next => patch("thinking", next)} />
      <Switch aria-label={i18n.formatMessage(rolesMessages.enableRole, { role_name: role.id })} checked={role.enabled} disabled={busy} onCheckedChange={next => patch("enabled", next)} />
    </>} />;
}
/** 详情只放低频字段；模型、思考与启用是行内即时操作，草稿不持有，避免互相覆盖。 */
function RoleEditor({ initialId, onSaved }: { initialId: string | null; onSaved(id: string): void }) {
  const i18n = useI18n();
  const slugField = useId();
  const { snapshot } = useSettingsConfiguration();
  const { run, busy, error } = useConfigurationAction("inline");
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const [slug, setSlug] = useState(initialId ?? "");
  const current = snapshot?.roles.find(role => role.id === id);
  const stored = id ? snapshot?.overrides.roles[id] ?? {} : {};
  const pick = (overrides: ModelRoleOverrides) => ({ description: overrides.description, hidden: overrides.hidden });
  const [value, setValue] = useState(() => pick(stored));
  const base = snapshot?.defaults.roles[current?.builtin ? current.id : "default"];
  if (!base || !snapshot) return null;
  const dirty = !current || slug !== id || JSON.stringify(pick(stored)) !== JSON.stringify(value);
  const users = current ? snapshot.agents.filter(agent => agent.modelRole === current.id || agent.fallbackRole === current.id) : [];
  return <Editor form="role-form" title={current?.id ?? i18n.formatMessage(rolesMessages.newRole)} description={current?.builtin ? i18n.formatMessage(rolesMessages.builtinRole) : undefined} dirty={dirty} busy={busy} error={error}
    remove={current && !current.builtin ? { title: i18n.formatMessage(rolesMessages.deleteTitle),
      description: i18n.formatMessage(rolesMessages.deleteDescription, { current_name: current.id }),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "role", id: current.id }); if (result?.ok) void island.close({ force: true }); } } : undefined}>
    <form id="role-form" onSubmit={async event => {
      event.preventDefault();
      const latest = id ? snapshot.overrides.roles[id] ?? {} : {};
      const next: ModelRoleOverrides = { ...latest };
      for (const field of ["description", "hidden"] as const) { if (value[field] === undefined) delete next[field]; else (next as Record<string, unknown>)[field] = value[field]; }
      const result = await run({ type: "role.save", id, value: { ...next, id: slug } });
      if (result?.ok && result.savedId) { setId(result.savedId); setSlug(result.savedId); onSaved(result.savedId); setValue(pick(result.snapshot.overrides.roles[result.savedId]!)); }
    }}><FieldGroup>
      <Field><FieldLabel htmlFor={slugField}>{i18n.formatMessage(rolesMessages.id)}</FieldLabel>
        <Input id={slugField} value={slug} readOnly={current?.builtin} required maxLength={160} pattern="[a-z0-9]+((_|-)[a-z0-9]+)*" className="font-mono" onChange={event => setSlug(event.target.value)} /></Field>
      <TextField label={i18n.formatMessage(rolesMessages.purpose)} value={value.description ?? ""} placeholder={base.description} onChange={next => setValue(v => ({ ...v, description: next || undefined }))} multiline
        hint={current?.builtin ? i18n.formatMessage(rolesMessages.purposeHint) : undefined} />
      <OverrideToggleField label={i18n.formatMessage(rolesMessages.availableToAgents)} hint={i18n.formatMessage(rolesMessages.availableToAgentsHint)}
        value={value.hidden === undefined ? undefined : !value.hidden} inherited={!base.hidden} onChange={next => setValue(v => ({ ...v, hidden: next === undefined ? undefined : !next }))} />
      {current && <Field><FieldLabel>{i18n.formatMessage(rolesMessages.usedBy)}</FieldLabel>
        {users.length ? <ul className="flex flex-wrap gap-1.5" aria-label={i18n.formatMessage(rolesMessages.agentsUsingRole)}>
          {users.map(agent => <li key={agent.id}><Badge variant="secondary" className="gap-1">
            {agent.id}
            {agent.modelRole !== current.id && <span className="text-muted-foreground">· {i18n.formatMessage(rolesMessages.fallback)}</span>}
          </Badge></li>)}
        </ul> : <FieldDescription>{i18n.formatMessage(rolesMessages.noAgentsUsingRole)}</FieldDescription>}
      </Field>}
    </FieldGroup></form>
    {!current && <p className="type-caption mt-4">{i18n.formatMessage(rolesMessages.chooseModelHint)}</p>}
  </Editor>;
}
