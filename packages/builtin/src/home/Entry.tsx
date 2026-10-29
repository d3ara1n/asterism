import { ArrowUp, Bot, Settings } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { defaultAgentPreset, StartAgentSession } from "@asterism-app/builtin-api/contracts";
import { useI18n, useRendererCalls, useRendererSettings, type RendererPrepareContext, type SessionEntryProps } from "@asterism-app/sdk/renderer";
import type { ThinkingLevel, UiText } from "@asterism-app/sdk/contracts";
import { createMessageDraft, type MessageDraft } from "../agent/conversation/draft";
import { SubmissionIdentity } from "../agent/conversation/submission";
import { AttachFiles, DraftFiles, DraftFileError, fileInputEvents } from "../agent/conversation/Files";
import { ModelChoices } from "../agent/conversation/ModelChoices";
import { useSettingsConfiguration } from "../configuration/renderer-state";
import { homeMessages } from "../messages/home";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { ConfigurationChoice as Choice } from "@asterism-app/ui/ConfigurationChoice";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { StatusText } from "@asterism-app/ui/ui/status";
import { InputGroup, InputGroupTextarea, InputGroupAddon } from "@asterism-app/ui/ui/input-group";

let entry: { draft: MessageDraft; identity: SubmissionIdentity } | undefined;
/** Draft content belongs to the plugin frontend lifetime, independently of Home mounting. */
export async function prepareHomeEntry(context: RendererPrepareContext) {
  const current = { draft: createMessageDraft(() => context.calls.input(StartAgentSession)), identity: new SubmissionIdentity() };
  entry = current;
  context.signal.addEventListener("abort", () => { void current.draft.close(); if (entry === current) entry = undefined; }, { once: true });
}
export function ConversationEntry({ ready, open }: SessionEntryProps) {
  const i18n = useI18n(), calls = useRendererCalls(), settings = useRendererSettings();
  if (!entry) throw new Error("The conversation entry has not been prepared.");
  const { draft, identity } = entry;
  const input = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const { snapshot, readError } = useSettingsConfiguration();
  const [agentId, setAgentId] = useState(defaultAgentPreset);
  const [model, setModel] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ThinkingLevel | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<UiText | null>(null);
  const pending = useRef(false);
  const agent = snapshot?.agents.find(agent => agent.id === agentId && agent.enabled);
  const canSend = ready && !busy && !input.uploading && !!agent && (!!input.text.trim() || !!input.files.length);
  const guidance = !snapshot ? null
    : !snapshot.modelProviders.length ? { message: homeMessages.setupProvider, action: homeMessages.openProviders, run: () => settings.openHost("providers") }
    : !snapshot.models.length ? { message: homeMessages.setupModel, action: homeMessages.openModels, run: () => settings.openHost("providers") }
    : !snapshot.roles.some(role => role.model !== null) ? { message: homeMessages.setupRole, action: homeMessages.openRoles, run: () => settings.open("asterism.builtin", "roles") }
    : null;
  const submit = async () => {
    if (!canSend || pending.current) return;
    pending.current = true; setBusy(true); setError(null); draft.lock(true);
    const value = { selection: { agent: agentId, model, thinking }, parts: draft.parts() };
    try {
      const result = await calls.invoke(StartAgentSession, { ...value, submissionId: identity.forInput(value) }, { content: draft.content() });
      identity.accepted(); draft.accepted(); open(result.sessionId);
    } catch (failure) { setError(failureDisplay(failure, homeMessages.startFailed)); }
    finally { pending.current = false; setBusy(false); draft.lock(false); }
  };
  return <>
    <form {...fileInputEvents(draft, busy || !ready)} onSubmit={event => { event.preventDefault(); void submit(); }}
      aria-label={i18n.text(commonMessages.newConversation)} className="rounded-xl border bg-muted">
      <InputGroup className="rounded-xl border-0 border-b bg-card shadow-none">
        <label htmlFor="builtin-first-message" className="sr-only">{i18n.text(homeMessages.firstMessage)}</label>
        <InputGroupTextarea id="builtin-first-message" className="min-h-32 px-4 py-4" rows={4} maxLength={100_000}
          placeholder={i18n.text(homeMessages.homePlaceholder)} value={input.text} disabled={busy}
          onChange={event => draft.setText(event.target.value)} aria-describedby="builtin-entry-status"
          onKeyDown={event => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault(); event.currentTarget.form?.requestSubmit();
          }} />
        <InputGroupAddon align="block-end" className="min-w-0 gap-1">
          <AttachFiles draft={draft} disabled={busy || !ready} /><DraftFiles draft={draft} disabled={busy} />
          <IconButton variant="default" className="rounded-full" label={i18n.text(commonMessages.sendMessage)} type="submit" disabled={!canSend}><ArrowUp /></IconButton>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex min-w-0 flex-wrap items-center gap-0.5 px-1.5 py-1">
        <Choice icon={<Bot />} label={i18n.text(commonMessages.agent)} value={agent?.id ?? i18n.text(commonMessages.agent)}
          disabled={!snapshot || busy} selected={agent?.id ?? ""} onSelect={setAgentId}
          options={snapshot?.agents.filter(agent => agent.enabled).map(agent => ({ value: agent.id, label: agent.id })) ?? []} />
        <ModelChoices configuration={snapshot} agent={agentId} model={model} thinking={thinking} disabled={busy}
          onModelChange={setModel} onThinkingChange={setThinking} />
      </div>
    </form>
    <DraftFileError draft={draft} className="mt-2" />
    {(error || readError) && <p role="alert" className="mt-3 text-center"><StatusText tone="error">{i18n.text(error ?? readError ?? "")}</StatusText></p>}
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
      <p id="builtin-entry-status" role="status" className="type-caption">{i18n.text(busy ? homeMessages.startingConversation
        : !ready ? commonMessages.statusUnavailable : !snapshot ? (readError ? homeMessages.workbenchHint : commonMessages.loading) : guidance?.message ?? homeMessages.workbenchHint)}</p>
      {ready && !busy && guidance && <Button variant="ghost" size="sm" onClick={guidance.run}><Settings />{i18n.text(guidance.action)}</Button>}
    </div>
  </>;
}
