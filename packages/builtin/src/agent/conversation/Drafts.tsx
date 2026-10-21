import { useState, useSyncExternalStore } from "react";
import { useI18n } from "@atelier/sdk/renderer";
import { modelInputText } from "@atelier/sdk/contracts";
import { ArrowDownToLine, ArrowLeftRight, ChevronDown, ChevronUp, Paperclip } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@atelier/ui/ui/toggle-group";
import { Button } from "@atelier/ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@atelier/ui/ui/collapsible";
import { conversationMessages as messages } from "../../messages/conversation";
import { useConversationInteraction } from "./interaction";
import type { AgentDraft, DraftMode } from "../drafts-contract";
import { MessageSender } from "./MessageSender";

/** 内容按需占高；收起后只保留输入区上方的草稿把手。 */
export function AgentDraftsPanel({ onTake }: { onTake(): void }) {
  const i18n = useI18n();
  const interaction = useConversationInteraction();
  const [open, setOpen] = useState(true);
  if (!interaction.drafts.length && !interaction.pendingTake) return null;
  return <Collapsible open={open} onOpenChange={setOpen} className="shrink-0 border-t px-3" aria-label={i18n.text(messages.drafts)}>
    <CollapsibleContent>
      {interaction.pendingTake && <div className="flex items-center gap-2 py-1">
        <p role="status" className="type-caption min-w-0 flex-1">{i18n.text(messages.draftExchangePending)}</p>
        <Button type="button" size="xs" variant="outline" disabled={!interaction.canRetryTake}
          onClick={async () => { if (await interaction.retryTake()) onTake(); }}>{i18n.text(messages.retryTake)}</Button>
      </div>}
      <div className="max-h-40 space-y-1 overflow-y-auto py-1">
        {interaction.drafts.map(item => <DraftItem key={item.id} item={item} onTake={onTake} />)}
      </div>
    </CollapsibleContent>
    <div className="flex justify-center">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className="text-muted-foreground">
          {open ? <ChevronDown /> : <ChevronUp />}
          {i18n.text(messages.drafts)}<span className="tabular-nums">{interaction.drafts.length}</span>
          {interaction.pendingTake && <span>{i18n.text(messages.retryTake)}</span>}
        </Button>
      </CollapsibleTrigger>
    </div>
  </Collapsible>;
}

function DraftItem({ item, onTake }: { item: AgentDraft; onTake(): void }) {
  const i18n = useI18n();
  const interaction = useConversationInteraction();
  const state = useSyncExternalStore(interaction.draft.subscribe, interaction.draft.getSnapshot);
  const [pending, setPending] = useState(false);
  const exchange = Boolean(state.text.trim() || state.files.length);
  const modes = { none: messages.draftNone, steer: messages.draftSteer, follow: messages.draftFollow };
  const text = modelInputText(item.parts);
  const files = item.parts.filter(part => part.kind === "file");
  return <div className={`flex items-center gap-2 rounded-md px-2 py-1 ${item.sender.kind === "agent"
    ? "bg-external-message text-external-message-foreground" : "bg-muted text-foreground"}`}>
    <div className="max-w-20 shrink-0"><MessageSender sender={item.sender} /></div>
    <div className="min-w-0 flex-1">
      {text && <p className="type-caption truncate" title={text}>{text}</p>}
      {files.length > 0 && <p className="type-caption flex min-w-0 items-center gap-1 text-muted-foreground">
        <Paperclip className="size-3 shrink-0" /><span className="truncate" title={files.map(part => part.filename ?? part.mediaType).join(", ")}>
          {files.map(part => part.filename ?? part.mediaType).join(", ")}
        </span>
      </p>}
    </div>
    <ToggleGroup type="single" size="sm" value={item.mode} disabled={!interaction.editable || pending}
      className="shrink-0" aria-label={i18n.text(messages.draftMode)}
      onValueChange={value => {
        if (!value || value === item.mode || pending) return;
        setPending(true);
        void interaction.setMode(item, value as DraftMode).finally(() => setPending(false));
      }}>
      {(Object.keys(modes) as DraftMode[]).map(mode =>
        <ToggleGroupItem key={mode} value={mode}>{i18n.text(modes[mode])}</ToggleGroupItem>)}
    </ToggleGroup>
    <Button type="button" variant="ghost" size="icon-xs" disabled={!interaction.editable || state.uploading || pending}
      title={i18n.text(exchange ? messages.exchangeDraft : messages.takeDraft)}
      aria-label={i18n.text(exchange ? messages.exchangeDraft : messages.takeDraft)}
      onClick={async () => { if (await interaction.take(item)) onTake(); }}>
      {exchange ? <ArrowLeftRight /> : <ArrowDownToLine />}
    </Button>
  </div>;
}
