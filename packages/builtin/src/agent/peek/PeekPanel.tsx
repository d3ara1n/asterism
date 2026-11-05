import { useEffect, useRef, useSyncExternalStore } from "react";
import { Dialog } from "radix-ui";
import { ArrowUp, ScanSearch, Square, X } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@asterism-app/ui/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@asterism-app/ui/ui/input-group";
import { Message, MessageContent } from "@asterism-app/ui/ui/message";
import { Bubble, BubbleContent } from "@asterism-app/ui/ui/bubble";
import { StatusBadge, StatusText } from "@asterism-app/ui/ui/status";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem,
  MessageScrollerProvider, MessageScrollerViewport } from "@asterism-app/ui/ui/message-scroller";
import { commonMessages as uiMessages } from "@asterism-app/ui/messages/common";
import { peekMessages as messages } from "../../messages/peek";
import { commonMessages } from "../../messages/common";
import { conversationMessages } from "../../messages/conversation";
import { Markdown } from "@asterism-app/ui/markdown";
import type { PeekConversation, PeekTurn } from "./conversation";

/** Investigations accept no follow-up input while running; the composer becomes the phase and stop control. */
export function PeekPanel({ conversation, ready, onClose }: { conversation: PeekConversation; ready: boolean; onClose(): void }) {
  const i18n = useI18n();
  const { turns, draft, pending } = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => () => conversation.stop(), [conversation]);
  // Return focus to the input once a run settles, unless the user moved it elsewhere meanwhile.
  useEffect(() => {
    if (pending) return;
    const active = document.activeElement;
    if (active && active !== document.body && !form.current?.contains(active)) return;
    form.current?.querySelector<HTMLElement>("[data-slot=input-group-control]")?.focus({ preventScroll: true });
  }, [pending]);
  const phase = turns.at(-1)?.progress?.phase ?? "investigating";
  const send = () => { if (ready) void conversation.submit(draft); };
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 items-center gap-2 px-4 py-3">
      <Dialog.Title className="type-label min-w-0 flex-1 truncate">{i18n.text(messages.explain)}</Dialog.Title>
      <Button variant="ghost" size="icon-sm" aria-label={i18n.text(uiMessages.close)} onClick={onClose}><X /></Button>
    </div>
    {turns.length === 0
      ? <Empty className="p-6"><EmptyHeader>
        <EmptyMedia variant="icon"><ScanSearch /></EmptyMedia>
        <EmptyTitle className="type-label">{i18n.text(messages.question)}</EmptyTitle>
      </EmptyHeader></Empty>
      : <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport aria-label={i18n.text(messages.title)} className="select-text overflow-x-hidden">
            <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-5 p-4 pt-1">
              {turns.map((turn, index) => <MessageScrollerItem key={index} messageId={String(index)}>
                <PeekTurnView turn={turn} />
              </MessageScrollerItem>)}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>}
    <form ref={form} className="mx-auto w-full max-w-3xl shrink-0 p-3" onSubmit={event => { event.preventDefault(); send(); }}>
      <InputGroup>
        {pending
          ? <div className="flex min-w-0 flex-1 items-center self-stretch px-3">
            <span role="status" className="min-w-0"><StatusText tone="progress">{i18n.text(messages[phase])}</StatusText></span>
          </div>
          : <InputGroupTextarea value={draft} rows={1} onChange={event => conversation.setDraft(event.target.value)}
            aria-label={i18n.text(messages.ask)} placeholder={i18n.text(messages.ask)} disabled={!ready}
            className="min-h-0 max-h-[calc(3lh+1rem)] py-2"
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                send();
              }
            }} />}
        <InputGroupAddon align="inline-end" className="self-end py-1.5">
          {pending
            ? <InputGroupButton size="icon-xs" aria-label={i18n.text(conversationMessages.stop)} onClick={conversation.stop}><Square /></InputGroupButton>
            : <InputGroupButton type="submit" size="icon-xs" variant="default" disabled={!ready || !draft.trim()}
              aria-label={i18n.text(commonMessages.sendMessage)}><ArrowUp /></InputGroupButton>}
        </InputGroupAddon>
      </InputGroup>
    </form>
  </div>;
}

/** Each exchange marks its own non-successful outcome; a running turn streams without a marker. */
function PeekTurnView({ turn }: { turn: PeekTurn }) {
  const i18n = useI18n();
  const report = (turn.result?.data ?? turn.progress)?.report;
  const outcome = turn.result?.kind;
  return <div className="flex min-w-0 flex-col gap-3">
    <Message align="end"><MessageContent>
      <Bubble variant="muted"><BubbleContent className="whitespace-pre-wrap">{turn.question}</BubbleContent></Bubble>
    </MessageContent></Message>
    {report && <Markdown streaming={!turn.result}>{report}</Markdown>}
    {(outcome === "partial" || outcome === "cancelled") && <div>
      <StatusBadge tone={outcome === "partial" ? "warning" : "neutral"}>{i18n.text(messages[outcome])}</StatusBadge>
    </div>}
    {turn.result?.kind === "failed" && <Alert variant="destructive">
      <AlertDescription>{turn.result.error.message}</AlertDescription>
    </Alert>}
  </div>;
}
