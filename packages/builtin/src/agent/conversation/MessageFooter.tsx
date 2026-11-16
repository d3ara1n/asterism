import { useContext, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Copy, FileText, MoreHorizontal, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@asterism-app/sdk/renderer";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Button } from "@asterism-app/ui/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { ActionMenu, ActionMenuContent, ActionMenuGroup, ActionMenuItem, ActionMenuTarget, ActionMenuTrigger } from "@asterism-app/ui/ui/action-menu";
import { JsonView } from "@asterism-app/ui/json-view";
import { ScrollArea } from "@asterism-app/ui/ui/scroll-area";
import { conversationMessages as messages } from "../../messages/conversation";
import type { TimelineItem } from "./timeline";
import { MessageTimestamp } from "./MessageTimestamp";

import { ConversationShareContext } from "./share-context";
import { shareMessages } from "../../messages/share";

type Message = Extract<TimelineItem, { kind: "message" }>;

/** The message surface and its footer share one object menu; the composer remains outside this scope. */
export function MessageFooter({ node, text, children }: {
  node: Message; text: string; children: (footer: ReactNode) => ReactElement;
}) {
  const i18n = useI18n();
  const share = useContext(ConversationShareContext);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const copy = async (value: string) => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(value);
      toast.success(i18n.text(messages.inputCopied));
    } catch (error) {
      console.error("Input could not be copied.", error);
      toast.error(i18n.text(messages.inputCopyFailed));
    } finally { setCopying(false); }
  };
  // Use the saved input parts, including event frontmatter, without reading attachment bytes or source resources.
  const details = () => ({ id: node.id, createdAt: node.createdAt, sender: node.sender, parts: node.parts, startsTurn: node.startsTurn });
  const footer = <div className="flex items-center gap-2">
    <MessageTimestamp createdAt={node.createdAt} />
    <div className="nodrag nopan nokey flex items-center gap-0.5 opacity-60 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
      {text && <IconButton size="icon-xs" label={i18n.text(messages.copyInput)} disabled={copying} onClick={() => { void copy(text); }}><Copy /></IconButton>}
      {share && <IconButton size="icon-xs" label={i18n.text(shareMessages.share)} onClick={event => share(node.id, event.currentTarget)}><Share2 /></IconButton>}
      <ActionMenuTrigger asChild><Button ref={more} variant="ghost" size="icon-xs"
        aria-label={i18n.text(messages.inputMoreActions)}><MoreHorizontal /></Button></ActionMenuTrigger>
    </div>
  </div>;
  return <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
    <ActionMenu>
      <ActionMenuTarget asChild>{children(footer)}</ActionMenuTarget>
      <ActionMenuContent align="end" className="nodrag nopan nokey"
        onCloseAutoFocus={event => { if (detailsOpen) event.preventDefault(); }}>
        <ActionMenuGroup>
          <ActionMenuItem onSelect={() => setDetailsOpen(true)}><FileText />{i18n.text(messages.inputDetails)}</ActionMenuItem>
        </ActionMenuGroup>
      </ActionMenuContent>
    </ActionMenu>
    <DialogContent aria-describedby={undefined}
      onCloseAutoFocus={event => { event.preventDefault(); more.current?.focus(); }}
      className="nodrag nopan nokey flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col overflow-hidden sm:max-w-3xl">
      <DialogHeader className="shrink-0 pr-6"><DialogTitle>{i18n.text(messages.inputDetails)}</DialogTitle></DialogHeader>
      <ScrollArea className="-m-1 min-h-0 min-w-0 flex-1" contentClassName="p-1 pr-3 select-text" viewportClassName="focus-visible:outline-offset-[-2px]"
        viewportProps={{ tabIndex: 0, role: "region", "aria-label": i18n.text(messages.inputDetails) }}>
        {detailsOpen && <JsonView scrollable={false} value={details()} />}
      </ScrollArea>
      <DialogFooter className="shrink-0">
        <Button variant="outline" disabled={copying} onClick={() => { void copy(JSON.stringify(details(), null, 2)); }}><Copy />{i18n.text(messages.copyInputDetails)}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
