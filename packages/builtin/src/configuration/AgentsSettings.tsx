import { Plus, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { defaultAgentPreset } from "@asterism-app/builtin-api/contracts";

import type { AgentConfiguration, AgentOverrides } from "@asterism-app/builtin-api/contracts";
import type { ConfigurationSnapshot } from "./renderer-state";
import { agentsMessages } from "../messages/agents";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { FieldLabel, FieldGroup, Field, FieldDescription } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from "@asterism-app/ui/ui/input-group";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { StatusBadge } from "@asterism-app/ui/ui/status";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem, SelectSeparator } from "@asterism-app/ui/ui/select";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { useRendererIsland as useIsland } from "@asterism-app/sdk/renderer";
import { Section } from "@asterism-app/ui/settings-layout";
import { Editor, EditorSection, ModifiedNote, ReadStatus } from "@asterism-app/ui/configuration-forms";
import { useConfigurationAction, useSettingsConfiguration } from "./renderer-state";

type Base = Omit<AgentConfiguration, "id" | "builtin">;
const NONE = "__none";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const baseOf = (snapshot: ConfigurationSnapshot, agent?: AgentConfiguration): Base => snapshot.defaults.agents[agent?.builtin ? agent.id : defaultAgentPreset]!;

/** Override normalization: remove blank text and fields matching built-in values; budget fields compare individually. */
function normalize(draft: AgentOverrides, base: Base): AgentOverrides {
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(draft)) {
    if (raw === undefined) continue;
    let value = raw;
    if (key === "budget") {
      const budget = Object.fromEntries(Object.entries(raw as NonNullable<AgentOverrides["budget"]>)
        .filter(([field, item]) => item !== undefined && item !== base.budget[field as keyof Base["budget"]]));
      if (Object.keys(budget).length) result.budget = budget;
      continue;
    }
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value)) value = [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
    if (same(value, base[key as keyof Base])) continue;
    result[key] = value;
  }
  return result as AgentOverrides;
}

/* ---------- List ---------- */

export function AgentsSettings() {
  const i18n = useI18n();
  const { snapshot, readError, load } = useSettingsConfiguration();
  const island = useIsland();
  const [editingId, setEditingId] = useState<string | null>(null);
  const open = async (id: string | null, origin?: HTMLElement | null) => {
    const opened = await island.open({ key: `agent-${id ?? "new"}`, label: agentsMessages.agent, origin,
      render: () => <AgentEditor key={id ?? "new"} initialId={id} onSaved={setEditingId} /> });
    if (opened) setEditingId(id);
    return opened;
  };
  const agents = snapshot?.agents ?? [];
  return <Section title={i18n.formatMessage(agentsMessages.agents)} hint={i18n.formatMessage(agentsMessages.summary)}
    action={<Button size="sm" disabled={!snapshot} onClick={event => open(null, event.currentTarget)}><Plus />{i18n.formatMessage(agentsMessages.addAgent)}</Button>}>
    <ReadStatus loaded={!!snapshot} error={readError} onRetry={() => void load()} />
    {snapshot && <ItemGroup className="surface">{agents.map((agent, index) =>
      <div key={agent.id}>{index > 0 && <ItemSeparator />}
        <AgentRow agent={agent} snapshot={snapshot} selected={!!island.child && editingId === agent.id} onOpen={origin => open(agent.id, origin)} />
      </div>)}</ItemGroup>}
  </Section>;
}

function AgentRow({ agent, snapshot, selected, onOpen }: {
  agent: AgentConfiguration; snapshot: ConfigurationSnapshot; selected: boolean; onOpen: (origin: HTMLElement) => void;
}) {
  const i18n = useI18n();
  const { run, busy } = useConfigurationAction("toast");
  const setEnabled = (enabled: boolean) => {
    const stored = snapshot.overrides.agents[agent.id] ?? {};
    void run({ type: "agent.save", id: agent.id, value: { ...normalize({ ...stored, enabled }, baseOf(snapshot, agent)), id: agent.id } });
  };
  const role = agent.modelRole === null ? null : snapshot.roles.find(item => item.id === agent.modelRole);
  return <ListRow selected={selected} inactive={!agent.enabled} onOpen={onOpen}
    title={<>{agent.id}{agent.id === defaultAgentPreset && <Badge variant="secondary">{i18n.formatMessage(agentsMessages.default)}</Badge>}</>}
    description={agent.description}
    actions={<>
      {agent.modelRole !== null && !role
        ? <StatusBadge tone="error">{i18n.formatMessage(agentsMessages.unavailableRole)}</StatusBadge>
        : <Badge variant="secondary">{role ? role.id : i18n.formatMessage(agentsMessages.noRole)}</Badge>}
      <Switch aria-label={i18n.formatMessage(agentsMessages.enableAgent, { agent_name: agent.id })} checked={agent.enabled} disabled={busy} onCheckedChange={setEnabled} />
    </>} />;
}

/* ---------- Shared editor components ---------- */

/** Field label row: shows “Modified · Reset” on the right when the value differs from the built-in value. */
function Label({ htmlFor, children, modified, onRestore }: { htmlFor?: string; children: ReactNode; modified?: boolean; onRestore?: () => void }) {
  return <div className="flex items-center justify-between gap-2">
    <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>
    {modified && onRestore && <ModifiedNote onRestore={onRestore} />}
  </div>;
}

/**
 * Model role selection: the “None” item uses a sentinel only in the UI and saves as null; default is a real role saved as a normal ID.
 * Hidden roles are unavailable to agents, and disabled roles are unavailable in the application; neither appears among choices. Existing references to these or invalid roles appear as disabled items so the selector retains its current value.
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
      {blocked && <SelectItem value={blocked.id} disabled>{blocked.id}{!blocked.enabled ? i18n.formatMessage(agentsMessages.disabledSuffix) : i18n.formatMessage(agentsMessages.internalSuffix)}</SelectItem>}
    </SelectGroup><SelectSeparator /><SelectGroup>
      {selectable.map(role => <SelectItem key={role.id} value={role.id}>{role.id}</SelectItem>)}
    </SelectGroup></SelectContent>
  </Select>;
}

/* ---------- Editor ---------- */

function AgentEditor({ initialId, onSaved }: { initialId: string | null; onSaved(id: string): void }) {
  const i18n = useI18n();
  const { snapshot } = useSettingsConfiguration();
  const { run, busy, error } = useConfigurationAction("inline");
  const island = useIsland();
  const ids = { identity: useId(), description: useId(), prompt: useId(), role: useId(), requests: useId(), duration: useId() };
  const [id, setId] = useState(initialId);
  const [slug, setSlug] = useState(initialId ?? "");
  const current = snapshot?.agents.find(agent => agent.id === id);
  // Enabling is an immediate row action; the draft does not hold it, preventing mutual overwrites.
  const strip = ({ enabled: _enabled, ...rest }: AgentOverrides): AgentOverrides => rest;
  const [draft, setDraft] = useState<AgentOverrides>(() => strip(id ? snapshot?.overrides.agents[id] ?? {} : {}));
  if (!snapshot) return null;
  const base = baseOf(snapshot, current);
  const builtin = !!current?.builtin;
  const set = <K extends keyof AgentOverrides>(field: K, next: AgentOverrides[K]) => setDraft(previous => {
    const updated = { ...previous }; if (next === undefined) delete updated[field]; else updated[field] = next; return updated;
  });
  const setBudget = (field: keyof Base["budget"], next: number | null | undefined) => setDraft(previous => {
    const budget = { ...previous.budget };
    if (next == null) delete budget[field]; else budget[field] = next;
    const updated = { ...previous };
    if (Object.keys(budget).length) updated.budget = budget; else delete updated.budget;
    return updated;
  });
  const effective = <K extends keyof Base>(field: K): Base[K] => (draft[field as keyof AgentOverrides] !== undefined ? draft[field as keyof AgentOverrides] : base[field]) as Base[K];
  const normalized = normalize(draft, base);
  const stored = normalize(strip(id ? snapshot.overrides.agents[id] ?? {} : {}), base);
  const dirty = !current || slug !== id || !same(normalized, stored);
  const modified = (field: keyof AgentOverrides) => field in normalized;
  const budgetModified = (field: keyof Base["budget"]) => normalized.budget?.[field] !== undefined;
  // Budget values are required: the placeholder shows the inherited value, and Restore removes the override.
  const budgetField = (field: keyof Base["budget"], id: string, label: string, max?: number) =>
    <Field><Label htmlFor={id} modified={budgetModified(field)} onRestore={() => setBudget(field, undefined)}>{label}</Label>
      <Input id={id} type="number" inputMode="numeric" min={1} max={max} step={1} value={draft.budget?.[field] ?? ""}
        placeholder={String(base.budget[field])}
        className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        onChange={event => setBudget(field, event.target.value === "" ? undefined : Number(event.target.value))} /></Field>;

  const examples = effective("examples");
  const restore = (...fields: (keyof AgentOverrides)[]) => setDraft(previous => { const updated = { ...previous }; for (const field of fields) delete updated[field]; return updated; });

  return <Editor form="agent-form" title={current?.id ?? i18n.formatMessage(agentsMessages.newAgent)} description={builtin ? i18n.formatMessage(agentsMessages.builtinAgent) : undefined} dirty={dirty} busy={busy} error={error}
    restore={builtin && Object.keys(normalized).length > 0 ? () => setDraft({}) : undefined}
    remove={current ? { title: i18n.formatMessage(agentsMessages.deleteTitle),
      description: builtin
        ? i18n.formatMessage(agentsMessages.deleteBuiltinDescription, { current_name: current.id })
        : i18n.formatMessage(agentsMessages.deleteDescription, { current_name: current.id }),
      onConfirm: async () => { const result = await run({ type: "remove", kind: "agent", id: current.id }); if (result?.ok) void island.close({ force: true }); } } : undefined}>
    <form id="agent-form" onSubmit={async event => {
      event.preventDefault();
      const result = await run({ type: "agent.save", id, value: { ...normalized, id: slug,
        ...(current && snapshot.overrides.agents[current.id]?.enabled !== undefined ? { enabled: snapshot.overrides.agents[current.id]!.enabled } : {}) } });
      if (result?.ok && result.savedId) { setId(result.savedId); setSlug(result.savedId); onSaved(result.savedId); setDraft(strip(result.snapshot.overrides.agents[result.savedId] ?? {})); }
    }}><fieldset disabled={busy}>

      <EditorSection title={i18n.formatMessage(agentsMessages.basics)}><FieldGroup>
        <Field><Label htmlFor={ids.identity}>{i18n.formatMessage(agentsMessages.id)}</Label>
          <Input id={ids.identity} value={slug} readOnly={builtin} required maxLength={160} pattern="[a-z0-9]+((_|-)[a-z0-9]+)*" className="font-mono" onChange={event => setSlug(event.target.value)} /></Field>
        <Field><Label htmlFor={ids.description} modified={modified("description")} onRestore={() => restore("description")}>{i18n.formatMessage(agentsMessages.description)}</Label>
          <Textarea id={ids.description} rows={3} value={draft.description ?? ""} placeholder={base.description} onChange={event => set("description", event.target.value)} /></Field>
      </FieldGroup></EditorSection>

      <EditorSection title={i18n.formatMessage(agentsMessages.modelRoles)}><FieldGroup>
        <Field><Label htmlFor={ids.role} modified={modified("modelRole")} onRestore={() => restore("modelRole")}>{i18n.formatMessage(agentsMessages.defaultModelRole)}</Label>
          <RoleSelect id={ids.role} value={effective("modelRole")} onChange={next => set("modelRole", next)} />
          <FieldDescription>{i18n.formatMessage(agentsMessages.defaultModelRoleHint)}</FieldDescription></Field>
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

      <EditorSection collapsible defaultOpen={false} title={i18n.formatMessage(agentsMessages.budget)} hint={i18n.formatMessage(agentsMessages.budgetHint)}><FieldGroup>
        {budgetField("maxRequests", ids.requests, i18n.formatMessage(agentsMessages.maximumRequests))}
        {budgetField("maxDurationSeconds", ids.duration, i18n.formatMessage(agentsMessages.maximumDuration), 2147483)}
      </FieldGroup></EditorSection>

    </fieldset></form>
  </Editor>;
}
