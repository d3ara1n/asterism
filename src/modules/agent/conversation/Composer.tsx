import { useI18n } from "@atelier/sdk/renderer";
import { Square, ArrowUp } from "lucide-react";
import { useSyncExternalStore, type Ref } from "react";
import type { MessageDraft } from "./draft";
import { AttachFiles, DraftFiles, fileInputEvents } from "./Files";

import { Button } from "../../../renderer/shared/ui/button";
import { InputGroup, InputGroupTextarea, InputGroupAddon } from "../../../renderer/shared/ui/input-group";
import { commonMessages } from "../../messages/common";
import { conversationMessages } from "../../messages/conversation";

export function MessageComposer({ draft, inputRef, busy, ready, running, writable, onSend, onCancel, onContinue }: {
  draft: MessageDraft; inputRef: Ref<HTMLTextAreaElement>;
  busy: boolean; ready: boolean; running: boolean; writable: boolean;
  onSend(): Promise<void>; onCancel(): Promise<unknown>; onContinue(): Promise<void>;
}) {
  const i18n = useI18n();
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  return <form {...fileInputEvents(draft, busy || !ready)} onSubmit={event => { event.preventDefault(); void onSend(); }}>
  <DraftFiles draft={draft} disabled={busy} className="pt-0 pb-2" />
  <InputGroup>
    <InputGroupTextarea ref={inputRef} rows={3} maxLength={100_000} value={state.text} disabled={busy}
      onChange={event => draft.setText(event.target.value)} aria-label={i18n.formatMessage(conversationMessages.messagePlaceholder)}
      placeholder={running ? i18n.formatMessage(conversationMessages.draftPlaceholder) : i18n.formatMessage(conversationMessages.continuePlaceholder)}
      onKeyDown={event => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
        event.preventDefault(); event.currentTarget.form?.requestSubmit();
      }} />
    <InputGroupAddon align="block-end" className="justify-between">
      <AttachFiles draft={draft} disabled={busy || !ready} />
      {running ? <Button type="button" size="sm" variant="secondary" disabled={busy || !ready}
        onClick={() => { void onCancel(); }}><Square />{i18n.formatMessage(conversationMessages.stop)}</Button>
        : <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={!writable} onClick={() => { void onContinue(); }}>{i18n.formatMessage(conversationMessages.continue)}</Button>
          <Button type="submit" size="icon-sm" disabled={!writable || state.uploading || (!state.text.trim() && !state.files.length)} aria-label={i18n.formatMessage(commonMessages.sendMessage)} title={i18n.formatMessage(commonMessages.sendMessage)}><ArrowUp /></Button>
        </div>}
    </InputGroupAddon>
  </InputGroup>
</form>;
}
