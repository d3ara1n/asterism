import { useSyncExternalStore } from "react";
import { Dialog } from "radix-ui";
import { ArrowUp, Square, X } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import type { PeekClient } from "@asterism-app/builtin-api/contracts";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@asterism-app/ui/ui/input-group";
import { Message, MessageContent } from "@asterism-app/ui/ui/message";
import { Bubble, BubbleContent } from "@asterism-app/ui/ui/bubble";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem,
  MessageScrollerProvider, MessageScrollerViewport } from "@asterism-app/ui/ui/message-scroller";
import { commonMessages as uiMessages } from "@asterism-app/ui/messages/common";
import { peekMessages as messages } from "../../messages/peek";
import { commonMessages } from "../../messages/common";
import { conversationMessages } from "../../messages/conversation";
import { Markdown } from "../conversation/Markdown";
import type { PeekConversation } from "./conversation";

export function PeekPanel({ conversation, client, ready, onClose }: {
  conversation: PeekConversation; client: PeekClient; ready: boolean; onClose(): void;
}) {
  const i18n = useI18n();
  const { turns, draft, pending } = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot);
  const latest = turns.at(-1);
  const outcome = latest?.result?.kind;
  const status = pending ? messages[latest?.progress?.phase ?? "investigating"]
    : outcome && outcome !== "succeeded" ? messages[outcome] : null;
  const send = () => { if (ready) void conversation.submit(client, draft); };
  return <div className="flex h-[min(36rem,72cqh)] min-h-0 flex-col">
    <div className="flex shrink-0 items-center gap-2 px-4 py-3">
      <Dialog.Title className="type-label min-w-0 flex-1 truncate">{i18n.text(messages.explain)}</Dialog.Title>
      <span role="status">{status && <Badge variant={outcome === "failed" && !pending ? "destructive" : "secondary"}>
        {i18n.text(status)}
      </Badge>}</span>
      <Button variant="ghost" size="icon-sm" aria-label={i18n.text(uiMessages.close)} onClick={onClose}><X /></Button>
    </div>
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="flex-1">
        <MessageScrollerViewport aria-label={i18n.text(messages.title)} className="select-text overflow-x-hidden">
          <MessageScrollerContent className="gap-5 p-4 pt-1">
            {turns.map((turn, index) => {
              const report = (turn.result?.data ?? turn.progress)?.report;
              return <MessageScrollerItem key={index} messageId={String(index)}>
                <div className="flex min-w-0 flex-col gap-4">
                  <Message align="end"><MessageContent>
                    <Bubble variant="muted"><BubbleContent className="whitespace-pre-wrap">{turn.question}</BubbleContent></Bubble>
                  </MessageContent></Message>
                  {report && <Message><MessageContent>
                    <Bubble variant="ghost" className="w-full"><BubbleContent className="w-full">
                      <Markdown streaming={pending && index === turns.length - 1}>{report}</Markdown>
                    </BubbleContent></Bubble>
                  </MessageContent></Message>}
                  {turn.result?.kind === "failed" && <Alert variant="destructive">
                    <AlertDescription>{turn.result.error.message}</AlertDescription>
                  </Alert>}
                </div>
              </MessageScrollerItem>;
            })}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
    <form className="shrink-0 p-3" onSubmit={event => { event.preventDefault(); send(); }}>
      <InputGroup>
        <InputGroupTextarea autoFocus value={draft} onChange={event => conversation.setDraft(event.target.value)}
          aria-label={i18n.text(messages.question)} placeholder={i18n.text(messages.question)}
          className="max-h-32 min-h-16" disabled={!ready}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault();
              send();
            }
          }} />
        <InputGroupAddon align="block-end" className="justify-end">
          {pending
            ? <InputGroupButton size="icon-sm" aria-label={i18n.text(conversationMessages.stop)} onClick={conversation.stop}><Square /></InputGroupButton>
            : <InputGroupButton type="submit" size="icon-sm" variant="default" disabled={!ready || !draft.trim()}
              aria-label={i18n.text(commonMessages.sendMessage)}><ArrowUp /></InputGroupButton>}
        </InputGroupAddon>
      </InputGroup>
    </form>
  </div>;
}
