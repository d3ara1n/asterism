import type { Ref } from "react";
import { ArrowUp, Square } from "lucide-react";
import { t, s } from "../../../renderer/shared/i18n";
import { Button } from "../../../renderer/shared/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "../../../renderer/shared/ui/input-group";

export function MessageComposer({ draft, onDraftChange, inputRef, busy, ready, running, writable, onSend, onCancel, onContinue }: {
  draft: string; onDraftChange(value: string): void; inputRef: Ref<HTMLTextAreaElement>;
  busy: boolean; ready: boolean; running: boolean; writable: boolean;
  onSend(): Promise<void>; onCancel(): Promise<unknown>; onContinue(): Promise<void>;
}) {
  return <form onSubmit={event => { event.preventDefault(); void onSend(); }}>
  <InputGroup>
    <InputGroupTextarea ref={inputRef} rows={3} maxLength={100_000} value={draft} disabled={busy}
      onChange={event => onDraftChange(event.target.value)} aria-label={s("Message the agent", "向代理发送消息")}
      placeholder={running ? s("Draft your next message…", "可以先写下一条消息…") : s("Continue the conversation…", "继续对话…")}
      onKeyDown={event => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
        event.preventDefault(); event.currentTarget.form?.requestSubmit();
      }} />
    <InputGroupAddon align="block-end" className="justify-between">
      <span className="type-caption">{s("Enter to send · Shift + Enter for a new line", "Enter 发送 · Shift + Enter 换行")}</span>
      {running ? <Button type="button" size="sm" variant="secondary" disabled={busy || !ready}
        onClick={() => { void onCancel(); }}><Square />{s("Stop", "停止")}</Button>
        : <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={!writable} onClick={() => { void onContinue(); }}>{s("Continue", "继续执行")}</Button>
          <Button type="submit" size="icon-sm" disabled={!writable || !draft.trim()} aria-label={t.sendMessage} title={t.sendMessage}><ArrowUp /></Button>
        </div>}
    </InputGroupAddon>
  </InputGroup>
</form>;
}
