import { useState } from "react";
import { Plus } from "lucide-react";
import type { AgentOverrides, ConfigurationSnapshot, ModelRole, ModelRoleOverrides, ThinkingLevel } from "../../../shared/configuration";
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
import { ChoiceField, Editor, OverrideChoiceField, OverrideListField, OverrideNumberField, OverrideToggleField, SaveActions, TextField, lines } from "./forms";
import { s, useSettingsConfiguration } from "./state";

/** 编辑草稿只持有覆盖；撤下字段使用 delete，避免把继承视图回存。 */
function useOverrides<T extends object>(initial: T) {
  const [value, setValue] = useState<T>(() => structuredClone(initial));
  const set = <K extends keyof T>(field: K, next: T[K]) => setValue(previous => {
    const updated = { ...previous };
    if (next === undefined) delete updated[field];
    else updated[field] = next;
    return updated;
  });
  return { value, set, setValue };
}
const inheritanceHint = () => s("Leave descriptive text blank to use the built-in value. Changes take effect after saving.", "说明与提示词留空使用内置值，修改在保存后生效。");

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
export function AgentsSettings() {
  const { snapshot } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null) => island.open({ id: `agent-${id ?? "new"}`, label: s("Agent configuration", "代理配置"), width: { min: 440, grow: 1, max: 720 }, render: () => <AgentEditor key={id ?? "new"} initialId={id} /> });
  return <>
    <p className="type-caption mb-4">{s("Shared definitions for every agent object. Changes apply to existing agents on their next request.", "所有代理对象共用的配置，修改从已有代理的下一次请求生效。")}</p>
    {snapshot?.agents.map(agent => <Item key={agent.id} asChild size="sm"><Button type="button" variant="ghost" className="h-auto w-full justify-start text-left" onClick={() => open(agent.id)}>
      <ItemContent><ItemTitle>{agent.name}</ItemTitle></ItemContent><span className="type-caption">{!agent.enabled ? s("Disabled", "已停用") : agent.id === "worker" ? s("Default", "默认") : agent.builtin ? s("Built-in", "内置") : ""}</span>
    </Button></Item>)}
    <Button className="mt-4" disabled={!snapshot} onClick={() => open(null)}><Plus />{s("Add agent", "添加代理")}</Button>
  </>;
}
function AgentEditor({ initialId }: { initialId: string | null }) {
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const current = snapshot?.agents.find(agent => agent.id === id);
  const { value, set, setValue } = useOverrides<AgentOverrides>(id ? snapshot?.overrides.agents[id] ?? {} : {});
  const [toolDrafts, setToolDrafts] = useState(() => ({ allow: value.tools, exclude: value.excludeTools }));
  const [delegateDraft, setDelegateDraft] = useState(value.subagentRoles);
  const base = snapshot?.defaults.agents[current?.builtin ? current.id : "worker"];
  if (!base) return null;
  const policy = (tools: string[] | null | undefined, exclude: string[] | null | undefined) => tools != null ? "allow" : exclude != null ? "exclude" : "all";
  const inheritedMode = policy(base.tools, base.excludeTools);
  const mode = value.tools === undefined && value.excludeTools === undefined ? undefined : policy(value.tools, value.excludeTools);
  const effectiveMode = mode ?? inheritedMode;
  const toolText = (effectiveMode === "allow" ? value.tools : value.excludeTools)?.join("\n") ?? "";
  const delegates = value.subagentRoles;
  const delegateMode = delegates === undefined ? "inherit" : delegates === null ? "all" : "list";
  const roleOptions = snapshot?.roles.map(role => ({ value: role.id, label: `${role.name}${role.enabled ? "" : s(" (disabled)", "（已停用）")}` })) ?? [];
  return <Editor form="agent-form" title={s("Agent configuration", "代理配置")}><form id="agent-form" onSubmit={async event => {
    event.preventDefault(); const result = await run({ type: "agent.save", id, value: {
      ...value,
      ...(value.tools !== undefined && value.tools !== null ? { tools: lines(value.tools.join("\n")) } : {}),
      ...(value.excludeTools !== undefined && value.excludeTools !== null ? { excludeTools: lines(value.excludeTools.join("\n")) } : {}),
      ...(delegates !== undefined && delegates !== null ? { subagentRoles: lines(delegates.join("\n")) } : {}),
      ...(value.examples !== undefined ? { examples: lines(value.examples.join("\n")) } : {}),
    } });
    if (result.ok && result.savedId) {
      const saved = result.snapshot.overrides.agents[result.savedId]!;
      setId(result.savedId); setValue(saved);
      setToolDrafts({ allow: saved.tools, exclude: saved.excludeTools }); setDelegateDraft(saved.subagentRoles);
    }
  }}><fieldset disabled={busy}><p className="type-caption mb-4">{inheritanceHint()}</p><FieldGroup>
    <TextField label={s("Name", "名称")} value={value.name ?? ""} placeholder={current?.builtin ? base.name : undefined} onChange={next => set("name", next)} required={!current?.builtin} />
    <OverrideToggleField label={s("Enabled", "启用")} value={value.enabled} inherited={base.enabled} onChange={next => set("enabled", next)} />
    <OverrideChoiceField label={s("Default model role", "默认模型角色")} value={value.modelRole} inherited={base.modelRole} options={roleOptions} empty={s("Use default", "使用 default")} onChange={next => set("modelRole", next)} />
    <OverrideChoiceField label={s("Fallback model role", "备用模型角色")} value={value.fallbackRole} inherited={base.fallbackRole} options={roleOptions} empty={s("None", "无")} onChange={next => set("fallbackRole", next)} />
    <TextField label={s("Description", "描述")} value={value.description ?? ""} placeholder={base.description} onChange={next => set("description", next)} multiline />
    <TextField label={s("System prompt", "系统提示词")} value={value.systemPrompt ?? ""} placeholder={base.systemPrompt} onChange={next => set("systemPrompt", next)} multiline />
    <TextField label={s("When to select", "选择条件")} value={value.decisionTrigger ?? ""} placeholder={base.decisionTrigger} onChange={next => set("decisionTrigger", next)} multiline />
    <OverrideListField label={s("Task examples", "任务示例")} value={value.examples} inherited={base.examples} onChange={next => set("examples", next)} empty={s("No examples", "无示例")} />
    <OverrideChoiceField label={s("Tool policy", "工具策略")} value={mode} inherited={inheritedMode} options={[
      { value: "all", label: s("All authorized tools", "全部已授权工具") }, { value: "allow", label: s("Allow only listed tools", "仅允许列表中的工具") }, { value: "exclude", label: s("Exclude listed tools", "排除列表中的工具") },
    ]} onChange={next => setValue(previous => {
      const { tools: _tools, excludeTools: _excluded, ...rest } = previous;
      return next === undefined ? rest : { ...rest,
        tools: next === "allow" ? [...(toolDrafts.allow ?? base.tools ?? [])] : null,
        excludeTools: next === "exclude" ? [...(toolDrafts.exclude ?? base.excludeTools ?? [])] : null };
    })} />
    {effectiveMode !== "all" && <TextField label={s("Tool names (one per line)", "工具名（每行一项）")} value={toolText} placeholder={mode === undefined ? (base.tools ?? base.excludeTools ?? []).join("\n") : undefined}
      hint={s("Use names such as read or list. An empty allowlist disables resource tools; Weft's resource controls remain available.", "填写 read、list 等资源工具名。允许列表留空会禁用资源工具，Weft 的资源操作入口仍可用。")}
      onChange={next => {
        const entries = next.split("\n");
        setToolDrafts(previous => ({ ...previous, [effectiveMode]: entries }));
        setValue(previous => ({ ...previous, tools: effectiveMode === "allow" ? entries : null, excludeTools: effectiveMode === "exclude" ? entries : null }));
      }} multiline />}
    <ChoiceField label={s("Delegation", "委派范围")} value={delegateMode} options={[
      { value: "inherit", label: `${s("Built-in", "内置")} · ${base.subagentRoles === null ? s("All agents", "全部代理") : base.subagentRoles.join(", ") || s("No agents", "无代理")}` },
      { value: "all", label: s("All agents", "全部代理") }, { value: "list", label: s("Only listed agents", "仅列表中的代理") },
    ]} onChange={next => set("subagentRoles", next === "inherit" ? undefined : next === "all" ? null : [...(delegateDraft ?? base.subagentRoles ?? [])])} />
    {delegateMode === "list" && <TextField label={s("Allowed agent IDs (empty means none)", "可委派代理 ID（留空表示不允许）")} value={delegates?.join("\n") ?? ""} onChange={next => {
      const entries = next.split("\n"); setDelegateDraft(entries); set("subagentRoles", entries);
    }} multiline
      hint={snapshot?.agents.map(agent => `${agent.name}: ${agent.id}`).join(" · ")} />}
    <OverrideNumberField label={s("Timeout (seconds)", "超时（秒）")} value={value.timeout} inherited={base.timeout} onChange={next => set("timeout", next)} min={1} max={86_400} integer empty={s("Runtime default (600 seconds)", "运行时默认（600 秒）")} />
    <OverrideNumberField label={s("Maximum requests per turn", "每轮最大请求数")} value={value.maxTurns} inherited={base.maxTurns} onChange={next => set("maxTurns", next)} min={1} integer empty={s("Runtime default (32 requests)", "运行时默认（32 次请求）")} />
    <OverrideNumberField label={s("Cost limit (USD)", "费用上限（美元）")} value={value.maxCost} inherited={base.maxCost} onChange={next => set("maxCost", next)} min={0.001} empty={s("No cost limit", "不设费用上限")} />
    <p className="type-caption">{s("Tool policies do not grant resource access. Delegation is not connected yet; a cost limit currently prevents execution.", "工具策略不授予资源访问权。委派尚未接入；目前设置费用上限会阻止执行。")}</p>
  </FieldGroup><SaveActions onReset={() => {
    setValue(current?.builtin ? {} : { name: value.name });
    setToolDrafts({ allow: undefined, exclude: undefined }); setDelegateDraft(undefined);
  }} onRemove={current ? async () => {
    const result = await run({ type: "remove", kind: "agent", id: current.id });
    if (result.ok) void island.close({ force: true });
  } : undefined} /></fieldset></form></Editor>;
}
