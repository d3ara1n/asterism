import { useSyncExternalStore } from "react";
import { useI18n } from "@atelier/sdk/renderer";
import { modelInputText } from "@atelier/sdk/contracts";
import { ArrowDownToLine, ArrowLeftRight, Paperclip } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@atelier/ui/ui/toggle-group";
import { Button } from "@atelier/ui/ui/button";
import { conversationMessages as messages } from "../../messages/conversation";
import { useConversationInteraction } from "./interaction";
import type { DraftMode } from "../drafts-contract";
import { MessageSender } from "./MessageSender";

/** 非常驻的资源草稿箱；编辑器与条目交换时保留各自的完整附件。 */
export function AgentDraftsPanel({ onTake }: { onTake(): void }) {
  const i18n = useI18n();
  const interaction = useConversationInteraction();
  const state = useSyncExternalStore(interaction.draft.subscribe, interaction.draft.getSnapshot);
  if (!interaction.drafts.length && !interaction.pendingTake) return null;
  const exchange = Boolean(state.text.trim() || state.files.length);
  const modes = { none: messages.draftNone, steer: messages.draftSteer, follow: messages.draftFollow };
  return <section aria-label={i18n.text(messages.drafts)} className="shrink-0 space-y-2 border-t px-3 py-2">
    <p className="type-label">{i18n.text(messages.drafts)}</p>
    {interaction.pendingTake && <div className="space-y-1">
      <p role="status" className="type-caption">{i18n.text(messages.draftExchangePending)}</p>
      <Button type="button" size="sm" variant="outline" disabled={!interaction.canRetryTake}
        onClick={async () => { if (await interaction.retryTake()) onTake(); }}>{i18n.text(messages.retryTake)}</Button>
    </div>}
    <div className="max-h-48 space-y-3 overflow-y-auto">
      {interaction.drafts.map(item => <div key={item.id}
        className={`space-y-1 rounded-md px-2 py-2 ${item.sender.kind === "agent"
          ? "bg-external-message text-external-message-foreground" : "bg-muted text-foreground"}`}>
        <MessageSender sender={item.sender} />
        {modelInputText(item.parts) && <p className="type-caption line-clamp-3 whitespace-pre-wrap break-words">{modelInputText(item.parts)}</p>}
        {item.parts.filter(part => part.kind === "file").map((part, index) =>
          <p key={index} className="type-caption flex min-w-0 items-center gap-1 text-muted-foreground">
            <Paperclip className="size-3 shrink-0" /><span className="truncate" title={part.filename ?? part.mediaType}>{part.filename ?? part.mediaType}</span>
          </p>)}
        <div className="flex flex-wrap items-center justify-between gap-1">
          <ToggleGroup type="single" size="sm" variant="outline" value={item.mode}
            disabled={!interaction.editable || state.uploading}
            aria-label={i18n.text(messages.draftMode)}
            onValueChange={value => { if (value) void interaction.setMode(item, value as DraftMode); }}>
            {(Object.keys(modes) as DraftMode[]).map(mode =>
              <ToggleGroupItem key={mode} value={mode}>{i18n.text(modes[mode])}</ToggleGroupItem>)}
          </ToggleGroup>
          <Button type="button" variant="ghost" size="xs" disabled={!interaction.editable || state.uploading}
            title={i18n.text(exchange ? messages.exchangeDraft : messages.takeDraft)}
            onClick={async () => {
              if (await interaction.take(item)) onTake();
            }}>
            {exchange ? <ArrowLeftRight /> : <ArrowDownToLine />}{i18n.text(messages.takeDraft)}
          </Button>
        </div>
      </div>)}
    </div>
  </section>;
}
