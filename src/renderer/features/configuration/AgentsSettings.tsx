import { Plus, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import type { AgentConfiguration, AgentOverrides, ConfigurationSnapshot } from "../../../shared/configuration";
import { agentsMessages } from "../../messages/agents";
import { useI18n } from "../../shared/i18n";
import { Badge } from "@atelier/ui/ui/badge";
import { Button } from "@atelier/ui/ui/button";
import { Checkbox } from "@atelier/ui/ui/checkbox";
import { FieldLabel, FieldGroup, Field, FieldDescription, FieldSet, FieldLegend } from "@atelier/ui/ui/field";
import { Input } from "@atelier/ui/ui/input";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from "@atelier/ui/ui/input-group";
import { ItemGroup, ItemSeparator } from "@atelier/ui/ui/item";
import { ListRow } from "@atelier/ui/ui/list-row";
import { StatusBadge } from "@atelier/ui/ui/status";
import { RadioGroup, RadioGroupItem } from "@atelier/ui/ui/radio-group";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem, SelectSeparator } from "@atelier/ui/ui/select";
import { Switch } from "@atelier/ui/ui/switch";
import { Textarea } from "@atelier/ui/ui/textarea";
import { useIsland } from "../../shared/weave/Screen";
import { Section } from "../settings/layout";
import { Editor, EditorSection, ModifiedNote, OverrideNumberField } from "./forms";
import { useSettingsConfiguration } from "./state";

type Base = Omit<AgentConfiguration, "id" | "builtin">;
const NONE = "__none";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const baseOf = (snapshot: ConfigurationSnapshot, agent?: AgentConfiguration): Base => snapshot.defaults.agents[agent?.builtin ? agent.id : "worker"]!;

/**
 * 覆盖归一：空白文本撤下；与内置值相同的字段撤下；工具允许/排除作为一组比较。
 * 自定义代理必须保留名称。
 */
function normalize(draft: AgentOverrides, base: Base, builtin: boolean): AgentOverrides {
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(draft)) {
    if (raw === undefined || key === "tools" || key === "excludeTools") continue;
    let value = raw;
    if (typeof value === "string") { if (!value.trim()) continue; value = key === "name" ? value.trim() : value; }
    if (Array.isArray(value)) value = [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
    if (!(key === "name" && !builtin) && same(value, base[key as keyof Base])) continue;
    result[key] = value;
  }
  if (draft.tools !== undefined || draft.excludeTools !== undefined) {
    const clean = (list: string[] | null | undefined) => list == null ? null : [...new Set(list.map(item => item.trim()).filter(Boolean))];
    const tools = clean(draft.tools), excludeTools = clean(draft.excludeTools);
    if (!same([tools, excludeTools], [base.tools, base.excludeTools])) Object.assign(result, { tools, excludeTools });
  }
  return result as AgentOverrides;
}

/* ---------- 列表 ---------- */

export function AgentsSettings() {
  const i18n = useI18n();
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null, origin?: HTMLElement | null) => island.open({ id: `agent-${id ?? "new"}`, label: agentsMessages.agent, width: { min: 440, grow: 1, max: 720 }, origin,
    render: () => <AgentEditor key={id ?? "new"} initialId={id} /> });
  const setEnabled = (agent: AgentConfiguration, enabled: boolean) => {
    if (!snapshot) return;
    const stored = snapshot.overrides.agents[agent.id] ?? {};
    void run({ type: "agent.save", id: agent.id, value: normalize({ ...stored, enabled }, baseOf(snapshot, agent), agent.builtin) });
  };
  const agents = snapshot?.agents ?? [];
  return <Section title={i18n.formatMessage(agentsMessages.agents)} hint={i18n.formatMessage(agentsMessages.summary)}
    action={<Button size="sm" disabled={!snapshot} onClick={event => open(null, event.currentTarget)}><Plus />{i18n.formatMessage(agentsMessages.addAgent)}</Button>}>
    {snapshot && <ItemGroup className="surface">{agents.map((agent, index) => {
      const role = agent.modelRole === null ? null : snapshot.roles.find(item => item.id === agent.modelRole);
      return <div key={agent.id}>{index > 0 && <ItemSeparator />}
        <ListRow selected={island.child === `agent-${agent.id}`} inactive={!agent.enabled} onOpen={origin => open(agent.id, origin)}
          title={<>{agent.name}{agent.id === "worker" && <Badge variant="secondary">{i18n.formatMessage(agentsMessages.default)}</Badge>}</>}
          description={agent.description}
          actions={<>
            {agent.modelRole !== null && !role
              ? <StatusBadge tone="error">{i18n.formatMessage(agentsMessages.unavailableRole)}</StatusBadge>
              : <Badge variant="secondary">{role ? role.name : i18n.formatMessage(agentsMessages.noRole)}</Badge>}
            <Switch aria-label={i18n.formatMessage(agentsMessages.enableAgent, { agent_name: agent.name })} checked={agent.enabled} disabled={busy} onCheckedChange={next => setEnabled(agent, next)} />
          </>} /></div>;
    })}</ItemGroup>}
  </Section>;
}

/* ---------- 编辑器公共件 ---------- */

/** 字段标签行：右侧在偏离内置值时给出“已修改 · 恢复”。 */
function Label({ htmlFor, children, modified, onRestore }: { htmlFor?: string; children: ReactNode; modified?: boolean; onRestore?: () => void }) {
  return <div className="flex items-center justify-between gap-2">
    <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>
    {modified && onRestore && <ModifiedNote onRestore={onRestore} />}
  </div>;
}

/**
 * 模型角色选择：“无”项仅在界面使用哨兵值，保存时写为 null；default 是真实角色，按普通 ID 保存。
 * 隐藏角色不向代理开放，停用角色在软件内不可用，均不进入选项；已引用的此类或失效角色以禁用项显示，避免选择框丢失当前值。
 */
function RoleSelect({ id, value, onChange }: { id: string; value: string | null; onChange: (value: string | null) => void }) {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  const roles = snapshot?.roles ?? [];
  const selectable = roles.filter(role => role.enabled && !role.hidden);
  const blocked = value !== null ? roles.find(role => role.id === value && (!role.enabled || role.hidden)) : undefined;
  const missing = value !== null && !roles.some(role => role.id === value);
  return <Select value={value ?? NONE} onValueChange={next => onChange(next === NONE ? null : next)}>
    <SelectTrigger id={id} className="w-full" aria-invalid={missing || !!blocked || undefined}><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>
      <SelectItem value={NONE}>{i18n.formatMessage(agentsMessages.none)}</SelectItem>
      {missing && <SelectItem value={value} disabled>{i18n.formatMessage(agentsMessages.unavailableRoleOption)} · {value}</SelectItem>}
      {blocked && <SelectItem value={blocked.id} disabled>{blocked.name}{!blocked.enabled ? i18n.formatMessage(agentsMessages.disabledSuffix) : i18n.formatMessage(agentsMessages.internalSuffix)}</SelectItem>}
    </SelectGroup><SelectSeparator /><SelectGroup>
      {selectable.map(role => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
    </SelectGroup></SelectContent>
  </Select>;
}

/** chip 输入：回车或逗号添加，× 删除，空输入退格删除末项。 */
function TagInput({ id, value, onChange, placeholder }: { id: string; value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  const i18n = useI18n();
  const [text, setText] = useState("");
  const add = () => { const next = text.trim(); if (next && !value.includes(next)) onChange([...value, next]); setText(""); };
  return <div className="flex flex-col gap-2">
    {value.length > 0 && <ul className="flex flex-wrap gap-1.5">{value.map(tag => <li key={tag}>
      <Badge variant="secondary" className="gap-1 pr-1 font-mono">{tag}
        <Button type="button" variant="ghost" size="icon-xs" className="size-4 rounded-full" aria-label={i18n.formatMessage(agentsMessages.removeTag, { tag: tag })} onClick={() => onChange(value.filter(item => item !== tag))}><X /></Button>
      </Badge></li>)}</ul>}
    <InputGroup>
      <InputGroupInput id={id} value={text} placeholder={placeholder} className="font-mono" onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(); }
          else if (event.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }} onBlur={add} />
      <InputGroupAddon align="inline-end"><InputGroupButton disabled={!text.trim()} onClick={add}>{i18n.formatMessage(agentsMessages.addTag)}</InputGroupButton></InputGroupAddon>
    </InputGroup>
  </div>;
}

/* ---------- 编辑器 ---------- */

type ToolMode = "all" | "allow" | "exclude";
type DelegateMode = "all" | "list" | "none";

function AgentEditor({ initialId }: { initialId: string | null }) {
  const i18n = useI18n();
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const ids = { name: useId(), description: useId(), prompt: useId(), role: useId(), fallback: useId(), tools: useId() };
  const [id, setId] = useState(initialId);
  const current = snapshot?.agents.find(agent => agent.id === id);
  // 启用是列表行内的即时操作，草稿不持有，避免互相覆盖。
  const strip = ({ enabled: _enabled, ...rest }: AgentOverrides): AgentOverrides => rest;
  const [draft, setDraft] = useState<AgentOverrides>(() => strip(id ? snapshot?.overrides.agents[id] ?? {} : {}));
  const [toolLists, setToolLists] = useState<{ allow: string[]; exclude: string[] }>({ allow: [], exclude: [] });
  const [delegateMode, setDelegateMode] = useState<DelegateMode | null>(null);
  if (!snapshot) return null;
  const base = baseOf(snapshot, current);
  const builtin = !!current?.builtin;
  const set = <K extends keyof AgentOverrides>(field: K, next: AgentOverrides[K]) => setDraft(previous => {
    const updated = { ...previous }; if (next === undefined) delete updated[field]; else updated[field] = next; return updated;
  });
  const effective = <K extends keyof Base>(field: K): Base[K] => (draft[field as keyof AgentOverrides] !== undefined ? draft[field as keyof AgentOverrides] : base[field]) as Base[K];
  const normalized = normalize(draft, base, builtin);
  const stored = normalize(strip(id ? snapshot.overrides.agents[id] ?? {} : {}), base, builtin);
  const dirty = !current || !same(normalized, stored);
  const modified = (field: keyof AgentOverrides) => field in normalized;

  // 工具策略：两侧一组
  const groupOverridden = draft.tools !== undefined || draft.excludeTools !== undefined;
  const tools = groupOverridden ? draft.tools ?? null : base.tools;
  const excluded = groupOverridden ? draft.excludeTools ?? null : base.excludeTools;
  const toolMode: ToolMode = tools !== null ? "allow" : excluded !== null ? "exclude" : "all";
  const setToolMode = (mode: ToolMode) => {
    if (toolMode === "allow") setToolLists(lists => ({ ...lists, allow: tools ?? [] }));
    if (toolMode === "exclude") setToolLists(lists => ({ ...lists, exclude: excluded ?? [] }));
    const keep = (list: string[], fallback: string[] | null) => list.length ? list : fallback ?? [];
    setDraft(previous => ({ ...previous,
      tools: mode === "allow" ? keep(toolLists.allow, base.tools) : null,
      excludeTools: mode === "exclude" ? keep(toolLists.exclude, base.excludeTools) : null }));
  };
  const setToolList = (list: string[]) => setDraft(previous => ({ ...previous, tools: toolMode === "allow" ? list : null, excludeTools: toolMode === "exclude" ? list : null }));

  // 委派：null 不限定，空列表不允许，非空为名单
  const delegates = effective("subagentRoles");
  const derivedDelegate: DelegateMode = delegates === null ? "all" : delegates.length ? "list" : "none";
  const shownDelegate = delegateMode ?? derivedDelegate;
  const others = snapshot.agents.filter(agent => agent.id !== id);

  const examples = effective("examples");
  const restore = (...fields: (keyof AgentOverrides)[]) => setDraft(previous => { const updated = { ...previous }; for (const field of fields) delete updated[field]; return updated; });

  return <Editor form="agent-form" title={current?.name ?? i18n.formatMessage(agentsMessages.newAgent)} description={builtin ? i18n.formatMessage(agentsMessages.builtinAgent) : undefined} dirty={dirty}
    restore={builtin && Object.keys(normalized).length > 0 ? () => { setDraft({}); setDelegateMode(null); setToolLists({ allow: [], exclude: [] }); } : undefined}
    remove={current ? { title: i18n.formatMessage(agentsMessages.deleteTitle),
      description: builtin
        ? i18n.formatMessage(agentsMessages.deleteBuiltinDescription, { current_name: current.name })
        : i18n.formatMessage(agentsMessages.deleteDescription, { current_name: current.name }),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "agent", id: current.id }); if (result.ok) void island.close({ force: true }); } } : undefined}>
    <form id="agent-form" onSubmit={async event => {
      event.preventDefault();
      const result = await run({ type: "agent.save", id, value: current ? { ...normalized, ...(snapshot.overrides.agents[current.id]?.enabled !== undefined ? { enabled: snapshot.overrides.agents[current.id]!.enabled } : {}) } : normalized });
      if (result.ok && result.savedId) { setId(result.savedId); setDraft(strip(result.snapshot.overrides.agents[result.savedId] ?? {})); setDelegateMode(null); }
    }}><fieldset disabled={busy}>

      <EditorSection title={i18n.formatMessage(agentsMessages.basics)}><FieldGroup>
        <Field><Label htmlFor={ids.name} modified={builtin && modified("name")} onRestore={() => restore("name")}>{i18n.formatMessage(agentsMessages.name)}</Label>
          <Input id={ids.name} value={draft.name ?? ""} placeholder={builtin ? base.name : undefined} required={!builtin} maxLength={160} onChange={event => set("name", event.target.value)} /></Field>
        <Field><Label htmlFor={ids.description} modified={modified("description")} onRestore={() => restore("description")}>{i18n.formatMessage(agentsMessages.description)}</Label>
          <Textarea id={ids.description} rows={3} value={draft.description ?? ""} placeholder={base.description} onChange={event => set("description", event.target.value)} /></Field>
      </FieldGroup></EditorSection>

      <EditorSection title={i18n.formatMessage(agentsMessages.modelRoles)}><FieldGroup>
        <Field><Label htmlFor={ids.role} modified={modified("modelRole")} onRestore={() => restore("modelRole")}>{i18n.formatMessage(agentsMessages.defaultModelRole)}</Label>
          <RoleSelect id={ids.role} value={effective("modelRole")} onChange={next => set("modelRole", next)} />
          <FieldDescription>{i18n.formatMessage(agentsMessages.defaultModelRoleHint)}</FieldDescription></Field>
        <Field><Label htmlFor={ids.fallback} modified={modified("fallbackRole")} onRestore={() => restore("fallbackRole")}>{i18n.formatMessage(agentsMessages.fallbackModelRole)}</Label>
          <RoleSelect id={ids.fallback} value={effective("fallbackRole")} onChange={next => set("fallbackRole", next)} /></Field>
      </FieldGroup></EditorSection>

      <EditorSection title={i18n.formatMessage(agentsMessages.prompts)}><FieldGroup>
        <Field><Label htmlFor={ids.prompt} modified={modified("systemPrompt")} onRestore={() => restore("systemPrompt")}>{i18n.formatMessage(agentsMessages.systemPrompt)}</Label>
          <Textarea id={ids.prompt} rows={10} className="font-mono text-xs" value={draft.systemPrompt ?? ""} placeholder={base.systemPrompt} onChange={event => set("systemPrompt", event.target.value)} />
          {builtin && <FieldDescription>{i18n.formatMessage(agentsMessages.systemPromptHint)}</FieldDescription>}</Field>
        <Field><Label modified={modified("examples")} onRestore={() => restore("examples")}>{i18n.formatMessage(agentsMessages.taskExamples)}</Label>
          {examples.length > 0 && <ol className="flex flex-col gap-2">{examples.map((example, index) => <li key={index}>
            <InputGroup>
              <InputGroupInput aria-label={i18n.formatMessage(agentsMessages.example, { index___1: index + 1 })} value={example}
                onChange={event => set("examples", examples.map((item, at) => at === index ? event.target.value : item))} />
              <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label={i18n.formatMessage(agentsMessages.removeExample)}
                onClick={() => set("examples", examples.filter((_, at) => at !== index))}><X /></InputGroupButton></InputGroupAddon>
            </InputGroup></li>)}</ol>}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set("examples", [...examples, ""])}><Plus />{i18n.formatMessage(agentsMessages.addExample)}</Button></Field>
      </FieldGroup></EditorSection>

      <EditorSection title={i18n.formatMessage(agentsMessages.toolsAndDelegation)}><FieldGroup>
        <FieldSet>
          <div className="flex items-center justify-between gap-2"><FieldLegend variant="label">{i18n.formatMessage(agentsMessages.toolPolicy)}</FieldLegend>
            {(modified("tools") || modified("excludeTools")) && <ModifiedNote onRestore={() => restore("tools", "excludeTools")} />}</div>
          <RadioGroup value={toolMode} onValueChange={next => setToolMode(next as ToolMode)}>
            {([["all", i18n.formatMessage(agentsMessages.allAuthorizedTools)], ["allow", i18n.formatMessage(agentsMessages.onlyListedTools)], ["exclude", i18n.formatMessage(agentsMessages.exceptListedTools)]] as const).map(([mode, label]) =>
              <Field key={mode} orientation="horizontal"><RadioGroupItem value={mode} id={`${ids.tools}-${mode}`} /><FieldLabel htmlFor={`${ids.tools}-${mode}`} className="font-normal">{label}</FieldLabel></Field>)}
          </RadioGroup>
          {toolMode !== "all" && <Field>
            <TagInput id={ids.tools} value={(toolMode === "allow" ? tools : excluded) ?? []} onChange={setToolList} placeholder={i18n.formatMessage(agentsMessages.toolNamePlaceholder)} />
            <FieldDescription>{toolMode === "allow"
              ? i18n.formatMessage(agentsMessages.allowlistHint)
              : i18n.formatMessage(agentsMessages.denylistHint)}</FieldDescription>
          </Field>}
          <FieldDescription>{i18n.formatMessage(agentsMessages.toolPolicyHint)}</FieldDescription>
        </FieldSet>

        <FieldSet>
          <div className="flex items-center justify-between gap-2"><FieldLegend variant="label">{i18n.formatMessage(agentsMessages.delegation)}</FieldLegend>
            {modified("subagentRoles") && <ModifiedNote onRestore={() => { restore("subagentRoles"); setDelegateMode(null); }} />}</div>
          <RadioGroup value={shownDelegate} onValueChange={next => {
            const mode = next as DelegateMode; setDelegateMode(mode);
            set("subagentRoles", mode === "all" ? null : mode === "none" ? [] : delegates?.length ? delegates : []);
          }}>
            {([["all", i18n.formatMessage(agentsMessages.anyAgent)], ["list", i18n.formatMessage(agentsMessages.selectedAgents)], ["none", i18n.formatMessage(agentsMessages.noDelegation)]] as const).map(([mode, label]) =>
              <Field key={mode} orientation="horizontal"><RadioGroupItem value={mode} id={`${ids.tools}-d-${mode}`} /><FieldLabel htmlFor={`${ids.tools}-d-${mode}`} className="font-normal">{label}</FieldLabel></Field>)}
          </RadioGroup>
          {shownDelegate === "list" && <FieldGroup data-slot="checkbox-group" className="gap-3 rounded-md border px-3 py-3">
            {others.length ? others.map(agent => <Field key={agent.id} orientation="horizontal">
              <Checkbox id={`${ids.tools}-a-${agent.id}`} checked={!!delegates?.includes(agent.id)}
                onCheckedChange={next => set("subagentRoles", next === true ? [...(delegates ?? []), agent.id] : (delegates ?? []).filter(item => item !== agent.id))} />
              <FieldLabel htmlFor={`${ids.tools}-a-${agent.id}`} className="font-normal">{agent.name}</FieldLabel>
            </Field>) : <FieldDescription>{i18n.formatMessage(agentsMessages.noOtherAgents)}</FieldDescription>}
          </FieldGroup>}
          <FieldDescription>{i18n.formatMessage(agentsMessages.delegationHint)}</FieldDescription>
        </FieldSet>
      </FieldGroup></EditorSection>

      <EditorSection collapsible defaultOpen={false} title={i18n.formatMessage(agentsMessages.limits)}><FieldGroup>
        <OverrideNumberField label={i18n.formatMessage(agentsMessages.maximumRequests)} value={draft.maxTurns} inherited={base.maxTurns} onChange={next => set("maxTurns", next)} min={1} integer empty={i18n.formatMessage(agentsMessages.maximumRequestsPlaceholder)} />
      </FieldGroup></EditorSection>

    </fieldset></form>
  </Editor>;
}
