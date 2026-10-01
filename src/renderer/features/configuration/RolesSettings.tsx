import { useState } from "react";
import { Plus } from "lucide-react";
import type { AgentConfiguration, ModelRole } from "../../../shared/configuration";
import { thinkingSchema } from "../../../shared/configuration";
import { Button } from "../../shared/ui/button";
import { FieldGroup } from "../../shared/ui/field";
import { useIsland } from "../../shared/weave/Screen";
import { ChoiceField, Editor, NumberField, SaveActions, TextField, ToggleField, lines } from "./forms";
import { s, useSettingsConfiguration } from "./state";

export function RolesSettings() {
  const { snapshot } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null) => island.open({ id: `role-${id ?? "new"}`, label: s("Model role", "模型角色"), width: { min: 400, grow: 1, max: 620 }, render: () => <RoleEditor key={id ?? "new"} initialId={id} /> });
  return <>
    <p className="type-caption mb-4">{s("Reusable model choices for agents and application features. Hidden roles remain editable here.", "为代理与功能模块复用模型选择；隐藏的角色也可在这里编辑。")}</p>
    {snapshot?.roles.map(role => <button key={role.id} className="list-item" onClick={() => open(role.id)}>
      <span className="flex-1 truncate">{role.name}</span><span className="type-caption">{!role.enabled ? s("Disabled", "已停用") : role.hidden ? s("Hidden", "隐藏") : role.builtin ? s("Built-in", "内置") : ""}</span>
    </button>)}
    <Button className="mt-4" disabled={!snapshot} onClick={() => open(null)}><Plus />{s("Add role", "添加角色")}</Button>
  </>;
}
function RoleEditor({ initialId }: { initialId: string | null }) {
  const { snapshot, run } = useSettingsConfiguration();
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const current = snapshot?.roles.find(role => role.id === id);
  const [value, setValue] = useState<Omit<ModelRole, "id" | "revision" | "builtin">>(() => current ? {
    name: current.name, modelId: current.modelId, thinking: current.thinking, enabled: current.enabled, description: current.description, hidden: current.hidden,
  } : { name: "", modelId: null, thinking: null, enabled: true, description: "", hidden: false });
  const set = <K extends keyof typeof value>(field: K, next: typeof value[K]) => setValue(previous => ({ ...previous, [field]: next }));
  return <Editor title={s("Model role", "模型角色")}><form onSubmit={async event => {
    event.preventDefault(); const result = await run({ type: "role.save", id, value });
    if (result.ok) setId(result.savedId);
  }}><FieldGroup>
    <TextField label={s("Name", "名称")} value={value.name} onChange={next => set("name", next)} required />
    <ChoiceField label={s("Model", "模型")} value={value.modelId} empty={s("Inherit the conversation model", "继承当前对话模型")}
      options={snapshot?.models.map(model => ({ value: model.id, label: `${snapshot.providers.find(provider => provider.id === model.providerId)?.name ?? "?"} / ${model.name}${model.enabled ? "" : s(" (disabled)", "（已停用）")}` })) ?? []}
      onChange={next => set("modelId", next)} />
    <ChoiceField label={s("Thinking level", "思考等级")} value={value.thinking} empty={s("Inherit the conversation level", "继承当前对话等级")}
      options={thinkingSchema.options.map(level => ({ value: level, label: level }))} onChange={next => set("thinking", next as ModelRole["thinking"])} />
    <TextField label={s("Purpose", "用途描述")} value={value.description} onChange={next => set("description", next)} multiline />
    <ToggleField label={s("Enabled", "启用")} value={value.enabled} onChange={next => set("enabled", next)} />
    <ToggleField label={s("Hide from agent model-role selection", "不向代理开放为可选模型角色")} value={value.hidden} onChange={next => set("hidden", next)} />
  </FieldGroup><SaveActions cannotRemove={current?.builtin} onRemove={current ? async () => {
    const result = await run({ type: "remove", kind: "role", id: current.id});
    if (result.ok) island.close();
  } : undefined} /></form></Editor>;
}
export function AgentsSettings() {
  const { snapshot } = useSettingsConfiguration();
  const island = useIsland();
  const open = (id: string | null) => island.open({ id: `agent-${id ?? "new"}`, label: s("Agent configuration", "代理配置"), width: { min: 440, grow: 1, max: 720 }, render: () => <AgentEditor key={id ?? "new"} initialId={id} /> });
  return <>
    <p className="type-caption mb-4">{s("Shared definitions for main agents and delegated agents. Changes apply when a configuration is next selected.", "主代理与子代理共用的配置，修改在下次取用配置时生效。")}</p>
    {snapshot?.agents.map(agent => <button key={agent.id} className="list-item" onClick={() => open(agent.id)}>
      <span className="flex-1 truncate">{agent.name}</span><span className="type-caption">{!agent.enabled ? s("Disabled", "已停用") : agent.id === "worker" ? s("Default", "默认") : ""}</span>
    </button>)}
    <Button className="mt-4" disabled={!snapshot} onClick={() => open(null)}><Plus />{s("Add agent", "添加代理")}</Button>
  </>;
}
function AgentEditor({ initialId }: { initialId: string | null }) {
  const { snapshot, run } = useSettingsConfiguration();
  const island = useIsland();
  const [id, setId] = useState(initialId);
  const current = snapshot?.agents.find(agent => agent.id === id);
  const [value, setValue] = useState<Omit<AgentConfiguration, "id" | "revision" | "builtin">>(() => {
    if (current) { const { id: _id, revision: _revision, builtin: _builtin, ...fields } = current; return structuredClone(fields); }
    return { name: "", enabled: true, description: "", systemPrompt: "", modelRole: "default", fallbackRole: null, examples: [], decisionTrigger: "",
      tools: null, excludeTools: null, subagentRoles: [], timeout: 2400, maxTurns: null, maxCost: null };
  });
  const [toolText, setToolText] = useState((value.tools ?? value.excludeTools ?? []).join("\n"));
  const [delegateText, setDelegateText] = useState((value.subagentRoles ?? []).join("\n"));
  const [exampleText, setExampleText] = useState(value.examples.join("\n"));
  const mode = value.tools !== null ? "allow" : value.excludeTools !== null ? "exclude" : "all";
  const set = <K extends keyof typeof value>(field: K, next: typeof value[K]) => setValue(previous => ({ ...previous, [field]: next }));
  const roleOptions = snapshot?.roles.map(role => ({ value: role.id, label: `${role.name}${role.enabled ? "" : s(" (disabled)", "（已停用）")}` })) ?? [];
  return <Editor title={s("Agent configuration", "代理配置")}><form onSubmit={async event => {
    event.preventDefault(); const result = await run({ type: "agent.save", id,
      value: { ...value, tools: mode === "allow" ? lines(toolText) : null, excludeTools: mode === "exclude" ? lines(toolText) : null,
        subagentRoles: value.subagentRoles === null ? null : lines(delegateText), examples: lines(exampleText) } });
    if (result.ok) setId(result.savedId);
  }}><FieldGroup>
    <TextField label={s("Name", "名称")} value={value.name} onChange={next => set("name", next)} required />
    <ToggleField label={s("Enabled", "启用")} value={value.enabled} onChange={next => set("enabled", next)} />
    <ChoiceField label={s("Default model role", "默认模型角色")} value={value.modelRole} options={roleOptions} empty={s("Use default", "使用 default")} onChange={next => set("modelRole", next)} />
    <ChoiceField label={s("Fallback model role", "备用模型角色")} value={value.fallbackRole} options={roleOptions} empty={s("None", "无")} onChange={next => set("fallbackRole", next)} />
    <TextField label={s("Description", "描述")} value={value.description} onChange={next => set("description", next)} multiline />
    <TextField label={s("System prompt", "系统提示词")} value={value.systemPrompt} onChange={next => set("systemPrompt", next)} multiline />
    <TextField label={s("When to select", "选择条件")} value={value.decisionTrigger} onChange={next => set("decisionTrigger", next)} multiline />
    <TextField label={s("Task examples (one per line)", "任务示例（每行一项）")} value={exampleText} onChange={setExampleText} multiline />
    <ChoiceField label={s("Tool policy", "工具策略")} value={mode} options={[
      { value: "all", label: s("All authorized tools", "全部已授权工具") }, { value: "allow", label: s("Allow only listed tools", "仅允许列表中的工具") }, { value: "exclude", label: s("Exclude listed tools", "排除列表中的工具") },
    ]} onChange={next => setValue(previous => ({ ...previous, tools: next === "allow" ? lines(toolText) : null, excludeTools: next === "exclude" ? lines(toolText) : null }))} />
    {mode !== "all" && <TextField label={s("Tool IDs (one per line)", "工具 ID（每行一项）")} value={toolText} onChange={setToolText} multiline />}
    <ToggleField label={s("Limit delegated agents", "限制可委派代理")} value={value.subagentRoles !== null} onChange={next => set("subagentRoles", next ? lines(delegateText) : null)} />
    {value.subagentRoles !== null && <TextField label={s("Allowed agent IDs (empty means none)", "可委派代理 ID（留空表示不允许）")} value={delegateText} onChange={setDelegateText} multiline
      hint={snapshot?.agents.map(agent => `${agent.name}: ${agent.id}`).join(" · ")} />}
    <NumberField label={s("Timeout (seconds)", "超时（秒）")} value={value.timeout} onChange={next => set("timeout", next)} min={1} max={86_400} integer />
    <NumberField label={s("Maximum turns", "最大轮数")} value={value.maxTurns} onChange={next => set("maxTurns", next)} min={1} integer />
    <NumberField label={s("Cost limit (USD)", "费用上限（美元）")} value={value.maxCost} onChange={next => set("maxCost", next)} min={0.001} />
    <p className="type-caption">{s("Tool execution and delegation are not connected yet. These fields define the agent; they do not grant resource access.", "工具执行与委派尚未接入；这些字段定义代理，不授予资源访问权。")}</p>
  </FieldGroup><SaveActions onRemove={current ? async () => {
    const result = await run({ type: "remove", kind: "agent", id: current.id});
    if (result.ok) island.close();
  } : undefined} /></form></Editor>;
}
