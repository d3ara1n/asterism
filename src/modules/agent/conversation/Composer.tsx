import { useI18n } from "@atelier/sdk/renderer";
import { Square, ArrowUp } from "lucide-react";
import type { Ref } from "react";

import { Button } from "../../../renderer/shared/ui/button";
import { InputGroup, InputGroupTextarea, InputGroupAddon } from "../../../renderer/shared/ui/input-group";
import { commonMessages } from "../../messages/common";
import { conversationMessages } from "../../messages/conversation";

export function MessageComposer({ draft, onDraftChange, inputRef, busy, ready, running, writable, onSend, onCancel, onContinue }: {
  draft: string; onDraftChange(value: string): void; inputRef: Ref<HTMLTextAreaElement>;
  busy: boolean; ready: boolean; running: boolean; writable: boolean;
  onSend(): Promise<void>; onCancel(): Promise<unknown>; onContinue(): Promise<void>;
}) {
  const i18n = useI18n();
  return <form onSubmit={event => { event.preventDefault(); void onSend(); }}>
  <InputGroup>
    <InputGroupTextarea ref={inputRef} rows={3} maxLength={100_000} value={draft} disabled={busy}
      onChange={event => onDraftChange(event.target.value)} aria-label={i18n.formatMessage(conversationMessages.messagePlaceholder)}
      placeholder={running ? i18n.formatMessage(conversationMessages.draftPlaceholder) : i18n.formatMessage(conversationMessages.continuePlaceholder)}
      onKeyDown={event => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
        event.preventDefault(); event.currentTarget.form?.requestSubmit();
      }} />
    <InputGroupAddon align="block-end" className="justify-between">
      <span className="type-caption">{i18n.formatMessage(conversationMessages.keyboardHint)}</span>
      {running ? <Button type="button" size="sm" variant="secondary" disabled={busy || !ready}
        onClick={() => { void onCancel(); }}><Square />{i18n.formatMessage(conversationMessages.stop)}</Button>
        : <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={!writable} onClick={() => { void onContinue(); }}>{i18n.formatMessage(conversationMessages.continue)}</Button>
          <Button type="submit" size="icon-sm" disabled={!writable || !draft.trim()} aria-label={i18n.formatMessage(commonMessages.sendMessage)} title={i18n.formatMessage(commonMessages.sendMessage)}><ArrowUp /></Button>
        </div>}
    </InputGroupAddon>
  </InputGroup>
</form>;
}
