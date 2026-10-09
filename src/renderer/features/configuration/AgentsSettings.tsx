import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import type { AgentConfiguration, AgentOverrides, ConfigurationSnapshot } from "../../../shared/configuration";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "../../shared/ui/item";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Checkbox } from "../../shared/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "../../shared/ui/field";
import { Input } from "../../shared/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../../shared/ui/input-group";
import { RadioGroup, RadioGroupItem } from "../../shared/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "../../shared/ui/select";
import { Switch } from "../../shared/ui/switch";
import { Textarea } from "../../shared/ui/textarea";
import { useIsland } from "../../shared/weave/Screen";
import { cn } from "../../shared/utils";
import { Section } from "../settings/preview";
import { Editor, OverrideNumberField } from "./forms";
import { s, useSettingsConfiguration } from "./state";

type Base = Omit<AgentConfiguration, "id" | "revision" | "builtin">;
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
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null, origin?: HTMLElement | null) => island.open({ id: `agent-${id ?? "new"}`, label: s("Agent", "代理"), width: { min: 440, grow: 1, max: 720 }, origin,
    render: () => <AgentEditor key={id ?? "new"} initialId={id} /> });
  const setEnabled = (agent: AgentConfiguration, enabled: boolean) => {
    if (!snapshot) return;
    const stored = snapshot.overrides.agents[agent.id] ?? {};
    void run({ type: "agent.save", id: agent.id, value: normalize({ ...stored, enabled }, baseOf(snapshot, agent), agent.builtin) });
  };
  const agents = snapshot?.agents ?? [];
  return <Section title={s("Agents", "代理")} hint={s("Shared definitions for every agent object. Changes apply from the next request.", "所有代理对象共用的配置，修改从下一次请求生效。")}
    action={<Button size="sm" disabled={!snapshot} onClick={event => open(null, event.currentTarget)}><Plus />{s("Add agent", "添加代理")}</Button>}>
    {snapshot && <ItemGroup className="surface">{agents.map((agent, index) => {
      const selected = island.child === `agent-${agent.id}`;
      const role = agent.modelRole === null ? null : snapshot.roles.find(item => item.id === agent.modelRole);
      return <div key={agent.id}>{index > 0 && <ItemSeparator />}<Item size="sm" className={cn("relative transition-colors hover:bg-accent/60 has-[button:focus-visible]:bg-accent/60", selected && "bg-accent hover:bg-accent", !agent.enabled && "opacity-70")}>
        <ItemContent className="min-w-0">
          <button type="button" className="text-left outline-none after:absolute after:inset-0 focus-visible:underline" aria-current={selected || undefined}
            onClick={event => open(agent.id, event.currentTarget)}><ItemTitle>{agent.name}{agent.id === "worker" && <Badge variant="secondary">{s("Default", "默认")}</Badge>}</ItemTitle></button>
          <ItemDescription className="truncate">{agent.description}</ItemDescription>
        </ItemContent>
        <ItemActions className="relative">
          <Badge variant="outline" className={cn("font-normal text-muted-foreground", agent.modelRole !== null && !role && "text-destructive")}>
            {agent.modelRole === null ? s("No role", "无角色") : role ? role.name : s("Unavailable role", "不可用的角色")}</Badge>
          <Switch aria-label={s(`Enable ${agent.name}`, `启用 ${agent.name}`)} checked={agent.enabled} disabled={busy} onCheckedChange={next => setEnabled(agent, next)} />
        </ItemActions>
      </Item></div>;
    })}</ItemGroup>}
  </Section>;
}

/* ---------- 编辑器公共件 ---------- */

/** 字段标签行：右侧在偏离内置值时给出“已修改 · 恢复”。 */
function Label({ htmlFor, children, modified, onRestore }: { htmlFor?: string; children: ReactNode; modified?: boolean; onRestore?: () => void }) {
  return <div className="flex items-center justify-between gap-2">
    <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>
    {modified && onRestore && <span className="type-caption">{s("Modified", "已修改")} · <button type="button" className="underline-offset-2 hover:underline" onClick={onRestore}>{s("Restore", "恢复")}</button></span>}
  </div>;
}
function Heading({ children }: { children: ReactNode }) { return <h3 className="type-section mb-3 mt-8 first:mt-0">{children}</h3>; }

/**
 * 模型角色选择：“无”项仅在界面使用哨兵值，保存时写为 null；default 是真实角色，按普通 ID 保存。
 * 隐藏角色不向代理开放，停用角色在软件内不可用，均不进入选项；已引用的此类或失效角色以禁用项显示，避免选择框丢失当前值。
 */
function RoleSelect({ id, value, onChange }: { id: string; value: string | null; onChange: (value: string | null) => void }) {
  const { snapshot } = useSettingsConfiguration();
  const roles = snapshot?.roles ?? [];
  const selectable = roles.filter(role => role.enabled && !role.hidden);
  const blocked = value !== null ? roles.find(role => role.id === value && (!role.enabled || role.hidden)) : undefined;
  const missing = value !== null && !roles.some(role => role.id === value);
  return <Select value={value ?? NONE} onValueChange={next => onChange(next === NONE ? null : next)}>
    <SelectTrigger id={id} className={cn("w-full", (missing || blocked) && "text-destructive")}><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>
      <SelectItem value={NONE}>{s("None", "无")}</SelectItem>
      {missing && <SelectItem value={value} disabled>{s("Unavailable role", "不可用的角色")} · {value}</SelectItem>}
      {blocked && <SelectItem value={blocked.id} disabled>{blocked.name}{!blocked.enabled ? s(" (disabled)", "（已停用）") : s(" (internal, not available to agents)", "（内部角色，代理不可用）")}</SelectItem>}
    </SelectGroup><SelectSeparator /><SelectGroup>
      {selectable.map(role => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
    </SelectGroup></SelectContent>
  </Select>;
}

/** chip 输入：回车或逗号添加，× 删除，空输入退格删除末项。 */
function TagInput({ id, value, onChange, placeholder }: { id: string; value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  const [text, setText] = useState("");
  const add = () => { const next = text.trim(); if (next && !value.includes(next)) onChange([...value, next]); setText(""); };
  return <div className="flex flex-col gap-2">
    {value.length > 0 && <ul className="flex flex-wrap gap-1.5">{value.map(tag => <li key={tag}>
      <Badge variant="secondary" className="gap-1 pr-1 font-mono">{tag}
        <button type="button" className="rounded-full p-0.5 hover:bg-background/60" aria-label={s(`Remove ${tag}`, `移除 ${tag}`)} onClick={() => onChange(value.filter(item => item !== tag))}><X /></button>
      </Badge></li>)}</ul>}
    <InputGroup>
      <InputGroupInput id={id} value={text} placeholder={placeholder} className="font-mono" onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(); }
          else if (event.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }} onBlur={add} />
      <InputGroupAddon align="inline-end"><InputGroupButton disabled={!text.trim()} onClick={add}>{s("Add", "添加")}</InputGroupButton></InputGroupAddon>
    </InputGroup>
  </div>;
}

/* ---------- 编辑器 ---------- */

type ToolMode = "all" | "allow" | "exclude";
type DelegateMode = "all" | "list" | "none";

function AgentEditor({ initialId }: { initialId: string | null }) {
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const ids = { name: useId(), description: useId(), prompt: useId(), trigger: useId(), role: useId(), fallback: useId(), tools: useId() };
  const [id, setId] = useState(initialId);
  const current = snapshot?.agents.find(agent => agent.id === id);
  // 启用是列表行内的即时操作，草稿不持有，避免互相覆盖。
  const strip = ({ enabled: _enabled, ...rest }: AgentOverrides): AgentOverrides => rest;
  const [draft, setDraft] = useState<AgentOverrides>(() => strip(id ? snapshot?.overrides.agents[id] ?? {} : {}));
  const [toolLists, setToolLists] = useState<{ allow: string[]; exclude: string[] }>({ allow: [], exclude: [] });
  const [delegateMode, setDelegateMode] = useState<DelegateMode | null>(null);
  const [advanced, setAdvanced] = useState(false);
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

  return <Editor form="agent-form" title={current?.name ?? s("New agent", "新代理")} description={builtin ? s("Built-in agent", "内置代理") : undefined} dirty={dirty}
    restore={builtin && Object.keys(normalized).length > 0 ? () => { setDraft({}); setDelegateMode(null); setToolLists({ allow: [], exclude: [] }); } : undefined}
    remove={current ? { title: s("Delete this agent?", "删除此代理？"),
      description: builtin
        ? s(`“${current.name}” will be removed and will not come back on its own. Conversations using it fail on their next request.`, `将移除「${current.name}」，内置代理删除后不会自动恢复。使用它的对话在下一次请求时失败。`)
        : s(`“${current.name}” will be removed. Conversations using it fail on their next request.`, `将移除「${current.name}」。使用它的对话在下一次请求时失败。`),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "agent", id: current.id }); if (result.ok) void island.close({ force: true }); } } : undefined}>
    <form id="agent-form" onSubmit={async event => {
      event.preventDefault();
      const result = await run({ type: "agent.save", id, value: current ? { ...normalized, ...(snapshot.overrides.agents[current.id]?.enabled !== undefined ? { enabled: snapshot.overrides.agents[current.id]!.enabled } : {}) } : normalized });
      if (result.ok && result.savedId) { setId(result.savedId); setDraft(strip(result.snapshot.overrides.agents[result.savedId] ?? {})); setDelegateMode(null); }
    }}><fieldset disabled={busy}>

      <Heading>{s("Basics", "基本")}</Heading>
      <FieldGroup>
        <Field><Label htmlFor={ids.name} modified={builtin && modified("name")} onRestore={() => restore("name")}>{s("Name", "名称")}</Label>
          <Input id={ids.name} value={draft.name ?? ""} placeholder={builtin ? base.name : undefined} required={!builtin} maxLength={160} onChange={event => set("name", event.target.value)} /></Field>
        <Field><Label htmlFor={ids.description} modified={modified("description")} onRestore={() => restore("description")}>{s("Description", "描述")}</Label>
          <Textarea id={ids.description} rows={3} value={draft.description ?? ""} placeholder={base.description} onChange={event => set("description", event.target.value)} /></Field>
      </FieldGroup>

      <Heading>{s("Model roles", "模型角色")}</Heading>
      <FieldGroup>
        <Field><Label htmlFor={ids.role} modified={modified("modelRole")} onRestore={() => restore("modelRole")}>{s("Default model role", "默认模型角色")}</Label>
          <RoleSelect id={ids.role} value={effective("modelRole")} onChange={next => set("modelRole", next)} />
          <FieldDescription>{s("When unset, the default role is used. Prefills the model when this agent is chosen; you can still pick another model per conversation.", "不设置时使用 default 角色。选用此代理时预填模型，对话中仍可改选其他模型。")}</FieldDescription></Field>
        <Field><Label htmlFor={ids.fallback} modified={modified("fallbackRole")} onRestore={() => restore("fallbackRole")}>{s("Fallback model role", "备用模型角色")}</Label>
          <RoleSelect id={ids.fallback} value={effective("fallbackRole")} onChange={next => set("fallbackRole", next)} /></Field>
      </FieldGroup>

      <Heading>{s("Prompts", "提示词")}</Heading>
      <FieldGroup>
        <Field><Label htmlFor={ids.prompt} modified={modified("systemPrompt")} onRestore={() => restore("systemPrompt")}>{s("System prompt", "系统提示词")}</Label>
          <Textarea id={ids.prompt} rows={10} className="font-mono text-xs" value={draft.systemPrompt ?? ""} placeholder={base.systemPrompt} onChange={event => set("systemPrompt", event.target.value)} />
          {builtin && <FieldDescription>{s("Leave blank to use the built-in prompt shown above.", "留空使用上方显示的内置提示词。")}</FieldDescription>}</Field>
        <Field><Label htmlFor={ids.trigger} modified={modified("decisionTrigger")} onRestore={() => restore("decisionTrigger")}>{s("When to select", "选择条件")}</Label>
          <Textarea id={ids.trigger} rows={3} value={draft.decisionTrigger ?? ""} placeholder={base.decisionTrigger} onChange={event => set("decisionTrigger", event.target.value)} /></Field>
        <Field><Label modified={modified("examples")} onRestore={() => restore("examples")}>{s("Task examples", "任务示例")}</Label>
          {examples.length > 0 && <ol className="flex flex-col gap-2">{examples.map((example, index) => <li key={index}>
            <InputGroup>
              <InputGroupInput aria-label={s(`Example ${index + 1}`, `示例 ${index + 1}`)} value={example}
                onChange={event => set("examples", examples.map((item, at) => at === index ? event.target.value : item))} />
              <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label={s("Remove example", "移除示例")}
                onClick={() => set("examples", examples.filter((_, at) => at !== index))}><X /></InputGroupButton></InputGroupAddon>
            </InputGroup></li>)}</ol>}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set("examples", [...examples, ""])}><Plus />{s("Add example", "添加示例")}</Button></Field>
      </FieldGroup>

      <Heading>{s("Tools and delegation", "工具与委派")}</Heading>
      <FieldGroup>
        <FieldSet>
          <div className="flex items-center justify-between gap-2"><FieldLegend variant="label">{s("Tool policy", "工具策略")}</FieldLegend>
            {(modified("tools") || modified("excludeTools")) && <span className="type-caption">{s("Modified", "已修改")} · <button type="button" className="underline-offset-2 hover:underline" onClick={() => restore("tools", "excludeTools")}>{s("Restore", "恢复")}</button></span>}</div>
          <RadioGroup value={toolMode} onValueChange={next => setToolMode(next as ToolMode)}>
            {([["all", s("All authorized tools", "全部已授权工具")], ["allow", s("Only listed tools", "仅允许列表中的工具")], ["exclude", s("All except listed tools", "排除列表中的工具")]] as const).map(([mode, label]) =>
              <Field key={mode} orientation="horizontal"><RadioGroupItem value={mode} id={`${ids.tools}-${mode}`} /><FieldLabel htmlFor={`${ids.tools}-${mode}`} className="font-normal">{label}</FieldLabel></Field>)}
          </RadioGroup>
          {toolMode !== "all" && <Field>
            <TagInput id={ids.tools} value={(toolMode === "allow" ? tools : excluded) ?? []} onChange={setToolList} placeholder={s("Tool name, e.g. read", "工具名，如 read")} />
            <FieldDescription>{toolMode === "allow"
              ? s("An empty allowlist disables resource tools; Weft's resource controls remain available.", "允许列表为空时没有资源工具，Weft 的资源操作入口仍可用。")
              : s("Listed tools are hidden and cannot be called.", "列表中的工具不出现，也不能调用。")}</FieldDescription>
          </Field>}
          <FieldDescription>{s("Tool policies narrow what is available. They never grant resource access.", "工具策略只收窄可用范围，不授予资源访问权。")}</FieldDescription>
        </FieldSet>

        <FieldSet>
          <div className="flex items-center justify-between gap-2"><FieldLegend variant="label">{s("Delegation", "委派范围")}</FieldLegend>
            {modified("subagentRoles") && <span className="type-caption">{s("Modified", "已修改")} · <button type="button" className="underline-offset-2 hover:underline" onClick={() => { restore("subagentRoles"); setDelegateMode(null); }}>{s("Restore", "恢复")}</button></span>}</div>
          <RadioGroup value={shownDelegate} onValueChange={next => {
            const mode = next as DelegateMode; setDelegateMode(mode);
            set("subagentRoles", mode === "all" ? null : mode === "none" ? [] : delegates?.length ? delegates : []);
          }}>
            {([["all", s("Any agent", "任意代理")], ["list", s("Only selected agents", "仅选中的代理")], ["none", s("No delegation", "不允许委派")]] as const).map(([mode, label]) =>
              <Field key={mode} orientation="horizontal"><RadioGroupItem value={mode} id={`${ids.tools}-d-${mode}`} /><FieldLabel htmlFor={`${ids.tools}-d-${mode}`} className="font-normal">{label}</FieldLabel></Field>)}
          </RadioGroup>
          {shownDelegate === "list" && <FieldGroup data-slot="checkbox-group" className="gap-3 rounded-md border px-3 py-3">
            {others.length ? others.map(agent => <Field key={agent.id} orientation="horizontal">
              <Checkbox id={`${ids.tools}-a-${agent.id}`} checked={!!delegates?.includes(agent.id)}
                onCheckedChange={next => set("subagentRoles", next === true ? [...(delegates ?? []), agent.id] : (delegates ?? []).filter(item => item !== agent.id))} />
              <FieldLabel htmlFor={`${ids.tools}-a-${agent.id}`} className="font-normal">{agent.name}</FieldLabel>
            </Field>) : <FieldDescription>{s("No other agents.", "没有其他代理。")}</FieldDescription>}
          </FieldGroup>}
          <FieldDescription>{s("Delegation is not connected yet; this setting takes effect once it is.", "委派尚未接入，接入后此设置生效。")}</FieldDescription>
        </FieldSet>
      </FieldGroup>

      <Button type="button" variant="ghost" size="sm" className="-ml-2 mt-8" aria-expanded={advanced} onClick={() => setAdvanced(open => !open)}>
        <ChevronDown className={advanced ? "rotate-180 transition-transform" : "transition-transform"} />{s("Limits", "限制")}</Button>
      {advanced && <FieldGroup className="mt-3">
        <OverrideNumberField label={s("Timeout (seconds)", "超时（秒）")} value={draft.timeout} inherited={base.timeout} onChange={next => set("timeout", next)} min={1} max={86_400} integer empty={s("Runtime default (600 s)", "运行时默认（600 秒）")} />
        <OverrideNumberField label={s("Maximum requests per turn", "每轮最大请求数")} value={draft.maxTurns} inherited={base.maxTurns} onChange={next => set("maxTurns", next)} min={1} integer empty={s("Runtime default (32)", "运行时默认（32 次）")} />
        <div className="flex flex-col gap-2">
          <OverrideNumberField label={s("Cost limit (USD)", "费用上限（美元）")} value={draft.maxCost} inherited={base.maxCost} onChange={next => set("maxCost", next)} min={0.001} empty={s("No limit", "不设上限")} />
          <p className="type-caption">{s("Cost tracking is not connected yet; setting a limit currently prevents execution.", "费用统计尚未接入，目前设置上限会阻止执行。")}</p>
        </div>
      </FieldGroup>}

    </fieldset></form>
  </Editor>;
}
