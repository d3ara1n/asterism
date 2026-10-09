import { useState } from "react";
import { Plus } from "lucide-react";
import type { AgentOverrides, ModelRoleOverrides, ThinkingLevel } from "../../../shared/configuration";
import { thinkingSchema } from "../../../shared/configuration";
import { Item, ItemContent, ItemTitle } from "../../shared/ui/item";
import { Button } from "../../shared/ui/button";
import { FieldGroup } from "../../shared/ui/field";
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

export function RolesSettings() {
  const { snapshot } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null) => island.open({ id: `role-${id ?? "new"}`, label: s("Model role", "模型角色"), width: { min: 400, grow: 1, max: 620 }, render: () => <RoleEditor key={id ?? "new"} initialId={id} /> });
  return <>
    <p className="type-caption mb-4">{s("Reusable model choices for agents and application features. Configure available models under Providers.", "为代理与功能模块复用模型选择；具体模型在提供商中配置。")}</p>
    {snapshot?.roles.map(role => <Item key={role.id} asChild size="sm"><Button type="button" variant="ghost" className="h-auto w-full justify-start text-left" onClick={() => open(role.id)}>
      <ItemContent><ItemTitle>{role.name}</ItemTitle></ItemContent><span className="type-caption">{!role.enabled ? s("Disabled", "已停用") : role.hidden ? s("Hidden", "隐藏") : role.builtin ? s("Built-in", "内置") : ""}</span>
    </Button></Item>)}
    <Button className="mt-4" disabled={!snapshot} onClick={() => open(null)}><Plus />{s("Add role", "添加角色")}</Button>
  </>;
}
function RoleEditor({ initialId }: { initialId: string | null }) {
  const { snapshot, run, busy } = useSettingsConfiguration();
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const current = snapshot?.roles.find(role => role.id === id);
  const { value, set, setValue } = useOverrides<ModelRoleOverrides>(id ? snapshot?.overrides.roles[id] ?? {} : {});
  const base = snapshot?.defaults.roles[current?.builtin ? current.id : "default"];
  if (!base) return null;
  return <Editor form="role-form" title={s("Model role", "模型角色")}><form id="role-form" onSubmit={async event => {
    event.preventDefault(); const result = await run({ type: "role.save", id, value });
    if (result.ok && result.savedId) { setId(result.savedId); setValue(result.snapshot.overrides.roles[result.savedId]!); }
  }}><fieldset disabled={busy}><p className="type-caption mb-4">{inheritanceHint()}</p><FieldGroup>
    <TextField label={s("Name", "名称")} value={value.name ?? ""} placeholder={current?.builtin ? base.name : undefined} onChange={next => set("name", next)} required={!current?.builtin} />
    <OverrideChoiceField label={s("Model", "模型")} value={value.modelId} inherited={base.modelId} empty={s("Inherit the conversation model", "继承当前对话模型")}
      options={snapshot?.models.map(model => ({ value: model.id, label: `${snapshot.providers.find(provider => provider.id === model.providerId)?.name ?? "?"} / ${model.name}${model.enabled ? "" : s(" (disabled)", "（已停用）")}` })) ?? []}
      onChange={next => set("modelId", next)} />
    <OverrideChoiceField label={s("Thinking level", "思考等级")} value={value.thinking} inherited={base.thinking} empty={s("Inherit the conversation level", "继承当前对话等级")}
      options={thinkingSchema.options.map(level => ({ value: level, label: level }))} onChange={next => set("thinking", next as ThinkingLevel | null | undefined)} />
    <TextField label={s("Purpose", "用途描述")} value={value.description ?? ""} placeholder={base.description} onChange={next => set("description", next)} multiline />
    <OverrideToggleField label={s("Enabled", "启用")} value={value.enabled} inherited={base.enabled} onChange={next => set("enabled", next)} />
    <OverrideToggleField label={s("Hide from agent model-role selection", "不向代理开放为可选模型角色")} value={value.hidden} inherited={base.hidden} onChange={next => set("hidden", next)} />
  </FieldGroup><SaveActions cannotRemove={current?.builtin} onReset={() => setValue(current?.builtin ? {} : { name: value.name })} onRemove={current ? async () => {
    const result = await run({ type: "remove", kind: "role", id: current.id });
    if (result.ok) island.close();
  } : undefined} /></fieldset></form></Editor>;
}
export function AgentsSettings() {
  const { snapshot } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null) => island.open({ id: `agent-${id ?? "new"}`, label: s("Agent configuration", "代理配置"), width: { min: 440, grow: 1, max: 720 }, render: () => <AgentEditor key={id ?? "new"} initialId={id} /> });
  return <>
    <p className="type-caption mb-4">{s("Shared definitions for main agents and delegated agents. Changes apply to existing conversations next turn.", "主代理与子代理共用的配置，修改从已有对话的下一轮生效。")}</p>
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
    if (result.ok) island.close();
  } : undefined} /></fieldset></form></Editor>;
}
