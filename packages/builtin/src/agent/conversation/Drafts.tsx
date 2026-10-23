import { useState, useRef, type DragEvent, type KeyboardEvent } from "react";
import { useI18n } from "@atelier/sdk/renderer";
import { modelInputText } from "@atelier/sdk/contracts";
import {
  GripVertical, Inbox, ChevronDown, Paperclip,
  Bot, User, ArrowDownToLine, ArrowLeftRight, Trash2, MoreHorizontal,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@atelier/ui/ui/button";
import { Badge } from "@atelier/ui/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@atelier/ui/ui/collapsible";
import { Tooltip, TooltipTrigger, TooltipContent } from "@atelier/ui/ui/tooltip";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuItem, DropdownMenuGroup,
} from "@atelier/ui/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@atelier/ui/ui/alert-dialog";
import { StatusText } from "@atelier/ui/ui/status";
import { cn } from "@atelier/ui/utils";
import { conversationMessages as messages } from "../../messages/conversation";
import { useConversationInteraction } from "./interaction";
import { commonMessages } from "@atelier/ui/messages/common";
import type { AgentDraft, DraftMode } from "../drafts-contract";

/** 草稿箱面板；有条目或待确认交换时显示，其余时候不占空间。 */
export function AgentDraftsPanel({ onTake }: { onTake(): void }) {
  const i18n = useI18n();
  const interaction = useConversationInteraction();
  const [open, setOpen] = useState(true);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggingId = useRef<string | null>(null);

  const { drafts } = interaction;
  if (!drafts.length && !interaction.pendingTake) return null;

  // 摘要：各模式数量，只显示非零项
  const counts = { follow: 0, steer: 0, none: 0 };
  for (const d of drafts) counts[d.mode]++;
  const summaryParts: string[] = [];
  if (counts.follow) summaryParts.push(i18n.formatMessage(messages.draftSummaryFollow, { count: counts.follow }));
  if (counts.steer) summaryParts.push(i18n.formatMessage(messages.draftSummarySteer, { count: counts.steer }));
  if (counts.none) summaryParts.push(i18n.formatMessage(messages.draftSummaryNone, { count: counts.none }));

  // 拖拽处理
  const onDragStart = (e: DragEvent, id: string) => {
    draggingId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };
  const onDrop = (e: DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const id = draggingId.current;
    draggingId.current = null;
    if (!id) return;
    const srcIndex = drafts.findIndex(d => d.id === id);
    if (srcIndex < 0 || srcIndex === targetIndex) return;
    const beforeItem = drafts[srcIndex < targetIndex ? targetIndex + 1 : targetIndex];
    void interaction.move(drafts[srcIndex]!, beforeItem?.id ?? null);
  };
  const onDragEnd = () => { draggingId.current = null; setDragOverIndex(null); };

  return (
    <Collapsible open={open} onOpenChange={setOpen}
      className="shrink-0 border-t px-3 pb-1"
      aria-label={i18n.text(messages.drafts)}>

      {/* 把手 / 标题行 */}
      <CollapsibleTrigger asChild>
        <button type="button"
          className="flex w-full items-center gap-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          <Inbox aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="type-label shrink-0">{i18n.text(messages.drafts)}</span>
          <Badge variant="secondary" className="h-4 min-w-4 shrink-0 px-1 tabular-nums">{drafts.length}</Badge>
          {summaryParts.length > 0 && (
            <span className="type-caption min-w-0 flex-1 truncate text-left">{summaryParts.join(" · ")}</span>
          )}
          {interaction.pendingTake && !open && (
            <AlertTriangle aria-hidden className="size-3 shrink-0 text-warning" />
          )}
          <ChevronDown aria-hidden className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ml-auto",
            !open && "rotate-180",
          )} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {/* 待确认交换提示 */}
        {interaction.pendingTake && (
          <div className="mb-1 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-2 py-1">
            <StatusText tone="warning" className="min-w-0 flex-1">
              {i18n.text(messages.draftExchangePending)}
            </StatusText>
            <Button type="button" size="xs" variant="outline"
              disabled={!interaction.canRetryTake}
              onClick={async () => { if (await interaction.retryTake()) onTake(); }}>
              {i18n.text(messages.retryTake)}
            </Button>
          </div>
        )}

        {/* 条目列表 */}
        <div className="max-h-[min(12rem,35cqh)] space-y-0.5 overflow-y-auto py-0.5"
          role="list">
          {drafts.map((item, index) => (
            <DraftRow
              key={item.id}
              item={item}
              index={index}
              total={drafts.length}
              isDragOver={dragOverIndex === index}
              onTake={onTake}
              onDragStart={e => onDragStart(e, item.id)}
              onDragOver={e => onDragOver(e, index)}
              onDrop={e => onDrop(e, index)}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── 单条草稿行 ────────────────────────────────────────────────────────────────

function DraftRow({
  item, index, total, isDragOver, onTake,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  item: AgentDraft; index: number; total: number; isDragOver: boolean;
  onTake(): void;
  onDragStart(e: DragEvent): void;
  onDragOver(e: DragEvent): void;
  onDrop(e: DragEvent): void;
  onDragEnd(): void;
}) {
  const i18n = useI18n();
  const interaction = useConversationInteraction();
  const [modePending, setModePending] = useState(false);
  const [movePending, setMovePending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const gripRef = useRef<HTMLButtonElement>(null);

  const text = modelInputText(item.parts);
  const files = item.parts.filter(p => p.kind === "file");
  const hasText = Boolean(text.trim());

  // 键盘排序（Alt+↑/↓ on grip）
  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.altKey) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    if (movePending) return;
    setMovePending(true);
    const drafts = interaction.drafts;
    const before = e.key === "ArrowUp"
      ? drafts[index - 1]?.id ?? null           // 上移：放到前一项的位置
      : drafts[index + 2]?.id ?? null;           // 下移：放到后两项的位置
    // "上移"：before = 前一项的 id（把自己插到它前面）
    // 实际：上移 = before = drafts[index-1].id；下移 = before = drafts[index+2]?.id ?? null
    void interaction.move(item, before).finally(() => {
      setMovePending(false);
      // 保持焦点在 grip（移动后 React 重新渲染，需要微延迟）
      requestAnimationFrame(() => gripRef.current?.focus());
    });
  };

  const isAgent = item.sender.kind === "agent";
  const editorHasContent = (() => {
    // 取回时如果编辑器非空就是"交换"
    const state = interaction.draft.getSnapshot();
    return Boolean(state.text.trim() || state.files.length);
  })();

  // 来源标记
  const senderChip = isAgent ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[--color-external-message] px-1.5 text-[--color-external-message-foreground] text-[10px] font-medium leading-4 max-w-[7rem]">
      <Bot className="size-2.5 shrink-0" aria-hidden />
      <span className="truncate">{item.sender.kind === "agent" ? item.sender.name : ""}</span>
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 text-muted-foreground text-[10px] font-medium leading-4">
      <User className="size-2.5 shrink-0" aria-hidden />
    </span>
  );

  // 模式标签文字和样式
  const modeLabel = { none: messages.draftNone, steer: messages.draftSteer, follow: messages.draftFollow }[item.mode];
  const modeTone = { none: "outline" as const, steer: "secondary" as const, follow: "default" as const }[item.mode];

  return (
    <>
      {isDragOver && (
        <div className="mx-1 h-0.5 rounded-full bg-primary" aria-hidden />
      )}
      <div
        role="listitem"
        className="group/draft flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/40"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* 拖拽把手 */}
        <button
          ref={gripRef}
          type="button"
          draggable
          disabled={!interaction.editable || movePending}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onKeyDown={onGripKey}
          aria-label={`${i18n.text(messages.drafts)} ${index + 1} – Alt+↑/↓ ${i18n.text(messages.moveUp)}/${i18n.text(messages.moveDown)}`}
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-0 outline-none transition-opacity group-hover/draft:opacity-60 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
        >
          <GripVertical aria-hidden className="size-3" />
        </button>

        {/* 来源 */}
        {senderChip}

        {/* 正文预览（含预览 Tooltip） */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <span className="type-caption min-w-0 flex-1 cursor-default select-none truncate">
              {hasText ? text : files.length > 0
                ? i18n.formatMessage(messages.draftFilesOnly, { count: files.length })
                : "…"}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top" sideOffset={6}
            className="max-w-[min(22rem,calc(100vw-2rem))] space-y-1.5 text-left whitespace-pre-wrap break-words">
            {hasText && <p className="type-body">{text}</p>}
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {files.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 type-label text-foreground">
                    <Paperclip className="size-2.5 shrink-0" aria-hidden />
                    {f.kind === "file" ? (f.filename ?? f.mediaType) : ""}
                  </span>
                ))}
              </div>
            )}
          </TooltipContent>
        </Tooltip>

        {/* 附件计数小标 */}
        {files.length > 0 && (
          <span className="shrink-0 inline-flex items-center gap-0.5 type-label text-muted-foreground">
            <Paperclip className="size-2.5" aria-hidden />{files.length}
          </span>
        )}

        {/* 发送时机徽章 + 下拉 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={!interaction.editable || modePending}
              aria-label={`${i18n.text(messages.draftMode)}: ${i18n.text(modeLabel)}`}
              className="shrink-0 inline-flex items-center gap-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <Badge variant={modeTone} className="h-4 px-1.5 text-[10px] gap-0.5 cursor-pointer">
                {i18n.text(modeLabel)}
                <ChevronDown className="size-2.5 text-inherit" aria-hidden />
              </Badge>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52">
            <DropdownMenuRadioGroup
              value={item.mode}
              onValueChange={async value => {
                if (modePending || value === item.mode) return;
                setModePending(true);
                await interaction.setMode(item, value as DraftMode);
                setModePending(false);
              }}>
              <ModeItem value="none" label={i18n.text(messages.draftNone)} hint={i18n.text(messages.draftNoneHint)} />
              <ModeItem value="steer" label={i18n.text(messages.draftSteer)} hint={i18n.text(messages.draftSteerHint)} />
              <ModeItem value="follow" label={i18n.text(messages.draftFollow)} hint={i18n.text(messages.draftFollowHint)} />
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 取出 / 交换 */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button" variant="ghost" size="icon-xs"
              disabled={!interaction.editable}
              aria-label={i18n.text(editorHasContent ? messages.exchangeDraft : messages.takeDraft)}
              onClick={async () => { if (await interaction.take(item)) onTake(); }}>
              {editorHasContent ? <ArrowLeftRight aria-hidden /> : <ArrowDownToLine aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4} className="max-w-[14rem] space-y-0.5 text-left">
            <p>{i18n.text(editorHasContent ? messages.exchangeDraft : messages.takeDraftHint)}</p>
            {editorHasContent && <p className="type-caption">{i18n.text(messages.exchangeDraftHint)}</p>}
          </TooltipContent>
        </Tooltip>

        {/* 更多操作（移动 + 丢弃） */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs"
              disabled={!interaction.editable}
              aria-label="更多操作"
              className="opacity-0 transition-opacity group-hover/draft:opacity-100 focus:opacity-100 data-[state=open]:opacity-100">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-36">
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={index === 0 || movePending}
                onSelect={async () => {
                  if (movePending) return;
                  setMovePending(true);
                  const drafts = interaction.drafts;
                  await interaction.move(item, drafts[index - 1]!.id);
                  setMovePending(false);
                }}>
                {i18n.text(messages.moveUp)}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === total - 1 || movePending}
                onSelect={async () => {
                  if (movePending) return;
                  setMovePending(true);
                  const drafts = interaction.drafts;
                  await interaction.move(item, drafts[index + 2]?.id ?? null);
                  setMovePending(false);
                }}>
                {i18n.text(messages.moveDown)}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setConfirmDiscard(true)}>
              <Trash2 aria-hidden className="size-3.5" />
              {i18n.text(messages.discardDraft)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 丢弃确认对话框 */}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18n.text(messages.discardDraftTitle)}</AlertDialogTitle>
            <AlertDialogDescription>
              {hasText
                ? <span className="line-clamp-3 break-words font-mono text-xs">{text}</span>
                : i18n.text(messages.discardDraftDescription)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18n.formatMessage(commonMessages.cancel)}</AlertDialogCancel>
            <AlertDialogAction variant="destructive"
              onClick={async e => {
                e.preventDefault();
                const ok = await interaction.discard(item);
                if (ok) setConfirmDiscard(false);
              }}>
              {i18n.text(messages.discardDraft)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── 模式下拉选项 ──────────────────────────────────────────────────────────────

function ModeItem({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <DropdownMenuRadioItem value={value} className="items-start gap-2 pr-2">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="mt-0.5 type-caption leading-snug">{hint}</p>
      </div>
    </DropdownMenuRadioItem>
  );
}
