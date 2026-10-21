import { useI18n } from "@atelier/sdk/renderer";
import { Square, ArrowUp, Archive } from "lucide-react";
import { useState, useSyncExternalStore, type Ref } from "react";
import type { MessageDraft } from "./draft";
import type { AgentExecutionState } from "../state";
import { AttachFiles, DraftFiles, DraftFileError, fileInputEvents } from "./Files";

import { Button } from "@atelier/ui/ui/button";
import { InputGroup, InputGroupTextarea, InputGroupAddon } from "@atelier/ui/ui/input-group";
import { commonMessages } from "../../messages/common";
import { conversationMessages } from "../../messages/conversation";

export function MessageComposer({ draft, inputRef, ready, executionState, writable, onSend, onSave, onCancel, onContinue }: {
  draft: MessageDraft; inputRef: Ref<HTMLTextAreaElement>;
  ready: boolean; executionState: AgentExecutionState; writable: boolean;
  onSend(): Promise<void>; onSave(): Promise<unknown>; onCancel(): Promise<unknown>; onContinue(): Promise<void>;
}) {
  const i18n = useI18n();
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const [controlPending, setControlPending] = useState(false);
  const control = async (work: () => Promise<unknown>) => {
    if (controlPending) return;
    setControlPending(true);
    try { await work(); } finally { setControlPending(false); }
  };
  const running = executionState === "running";
  const cancelDisabled = !ready || controlPending;
  const busy = state.locked;
  return <form {...fileInputEvents(draft, busy || !ready)} onSubmit={event => { event.preventDefault(); void onSend(); }}>
  <InputGroup>
    <InputGroupTextarea ref={inputRef} rows={3} maxLength={100_000} value={state.text} disabled={busy}
      onChange={event => draft.setText(event.target.value)} aria-label={i18n.formatMessage(conversationMessages.messagePlaceholder)}
      placeholder={running ? i18n.formatMessage(conversationMessages.draftPlaceholder) : i18n.formatMessage(conversationMessages.continuePlaceholder)}
      onKeyDown={event => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
        event.preventDefault(); event.currentTarget.form?.requestSubmit();
      }} />
    <InputGroupAddon align="block-end" className="min-w-0 gap-1">
      <AttachFiles draft={draft} disabled={busy || !ready} />
      <DraftFiles draft={draft} disabled={busy} />
      <Button type="button" size="sm" variant="ghost" disabled={busy || !ready || state.uploading || (!state.text.trim() && !state.files.length)}
        onClick={() => { void onSave(); }}><Archive />{i18n.text(conversationMessages.saveDraft)}</Button>
      {running ? <Button type="button" size="sm" variant="secondary" disabled={cancelDisabled}
        onClick={() => { void control(onCancel); }}><Square />{i18n.formatMessage(conversationMessages.stop)}</Button>
        : <div className="flex shrink-0 gap-1">
          {executionState === "incomplete" && <Button type="button" size="sm" variant="ghost" disabled={!writable || controlPending} onClick={() => { void control(onContinue); }}>{i18n.formatMessage(conversationMessages.continue)}</Button>}
          <Button type="submit" size="icon-sm" disabled={!writable || state.uploading || (!state.text.trim() && !state.files.length)} aria-label={i18n.formatMessage(commonMessages.sendMessage)} title={i18n.formatMessage(commonMessages.sendMessage)}><ArrowUp /></Button>
        </div>}
    </InputGroupAddon>
  </InputGroup>
  <DraftFileError draft={draft} className="mt-1" />
</form>;
}
