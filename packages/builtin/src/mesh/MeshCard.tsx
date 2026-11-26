import { useId, useRef, useState } from "react";
import { Check, MoreHorizontal, Network, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n, useRendererObject, type RendererReceipt } from "@asterism-app/sdk/renderer";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { ActionMenu, ActionMenuContent, ActionMenuGroup, ActionMenuItem, ActionMenuTarget, ActionMenuTrigger } from "@asterism-app/ui/ui/action-menu";
import { Button } from "@asterism-app/ui/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@asterism-app/ui/ui/empty";
import { Field, FieldLabel } from "@asterism-app/ui/ui/field";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Input } from "@asterism-app/ui/ui/input";
import { ItemGroup } from "@asterism-app/ui/ui/item";
import { ListRow, ListRowAction } from "@asterism-app/ui/ui/list-row";
import { Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { StatusBadge } from "@asterism-app/ui/ui/status";
import { VirtualList } from "@asterism-app/ui/ui/virtual-list";
import { CreateMeshChannel, DeleteMeshChannel, RenameMeshChannel, SelectMeshChannel, type MeshCardData } from "./contract";
import { meshMessages as messages } from "../messages/mesh";

type Channel = MeshCardData["channels"][number];
const popoverClass = "flex w-72 flex-col gap-3 p-3 text-sm";
const rowClass = "[--list-row-gap:--spacing(2)] [--list-row-x:--spacing(3)] [--list-row-y:--spacing(1.5)] [&_[data-slot=item-title]]:text-xs [&_[data-slot=item-description]]:text-xs [&_[data-slot=item-description]]:leading-snug";

/** Each entry gates only its own channel update; later updates from other entries win in processing order. */
function useChannelAction(onError?: (message: string) => void) {
  const object = useRendererObject(), i18n = useI18n();
  const gate = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const fail = (message: string) => { setError(message); onError?.(message); };
  const run = async (work: () => Promise<RendererReceipt>) => {
    if (gate.current || !object.view.ready) return false;
    gate.current = true; setPending(true); setError(null);
    try {
      const receipt = await work();
      if (receipt.ok) return true;
      fail(receipt.error.display ? i18n.text(receipt.error.display) : i18n.text(messages.failed));
      return false;
    } catch (failure) {
      console.error("Mesh channel update failed.", failure);
      fail(i18n.text(messages.failed));
      return false;
    } finally { gate.current = false; setPending(false); }
  };
  return { object, ready: object.view.ready, pending, error, run, clearError: () => setError(null) };
}

function ChannelError({ error }: { error: string | null }) {
  return error ? <p role="alert" className="type-caption break-words text-destructive">{error}</p> : null;
}

/** The draft takes the title when the popover opens; projection updates do not overwrite input being edited. */
function ChannelNameForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: {
  initial: string; submitLabel: string; pending: boolean; error: string | null; onSubmit(title: string): void; onCancel(): void;
}) {
  const i18n = useI18n(), id = useId();
  const [title, setTitle] = useState(initial);
  const trimmed = title.trim();
  const unchanged = !trimmed || trimmed === initial.trim();
  return <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); if (!pending && !unchanged) onSubmit(trimmed); }}>
    <Field className="gap-1.5">
      <FieldLabel htmlFor={id} className="type-label">{i18n.text(messages.name)}</FieldLabel>
      <Input id={id} autoFocus required maxLength={160} disabled={pending} value={title}
        onFocus={event => event.currentTarget.select()} onChange={event => setTitle(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
        }} />
    </Field>
    <ChannelError error={error} />
    <div className="flex justify-end gap-2">
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>{i18n.text(commonMessages.cancel)}</Button>
      <Button type="submit" size="sm" disabled={pending || unchanged} aria-busy={pending}>{pending && <Spinner />}{submitLabel}</Button>
    </div>
  </form>;
}

/** Creation joins the new channel; the trigger appears in the card titlebar and in the empty state. */
function CreateChannel({ variant }: { variant: "icon" | "button" }) {
  const i18n = useI18n(), action = useChannelAction();
  const [open, setOpen] = useState(false);
  const label = i18n.text(messages.create);
  return <Popover open={open} onOpenChange={next => {
    if (next) { action.clearError(); setOpen(true); } else if (!action.pending) setOpen(false);
  }}>
    {variant === "icon"
      ? <IconButton size="icon-xs" label={label} disabled={!action.ready} asChild><PopoverTrigger><Plus /></PopoverTrigger></IconButton>
      : <PopoverTrigger asChild><Button size="sm" variant="outline" disabled={!action.ready}><Plus />{label}</Button></PopoverTrigger>}
    <PopoverContent align={variant === "icon" ? "end" : "center"} className={popoverClass}>
      <ChannelNameForm initial="" submitLabel={i18n.text(commonMessages.create)} pending={action.pending} error={action.error}
        onCancel={() => setOpen(false)}
        onSubmit={async title => { if (await action.run(() => action.object.invoke(CreateMeshChannel, { title }))) setOpen(false); }} />
    </PopoverContent>
  </Popover>;
}

/** Titlebar content: the missing-channel state stays visible when the card is collapsed. */
export function MeshActions({ data }: { data: MeshCardData }) {
  const i18n = useI18n();
  return <>
    {data.channelId === null && <StatusBadge tone="neutral" role="status">{i18n.text(messages.disconnected)}</StatusBadge>}
    <CreateChannel variant="icon" />
  </>;
}

/**
 * Selecting a row connects the Mesh to that channel. Rename and delete open from the row menu, or its context menu,
 * in a popover anchored to the row; the popover keeps its last view while it closes.
 */
function ChannelRow({ channel, selected }: { channel: Channel; selected: boolean }) {
  const i18n = useI18n();
  const selection = useChannelAction(message => { toast.error(message); });
  const edit = useChannelAction();
  const [open, setOpen] = useState(false), [view, setView] = useState<"rename" | "delete">("rename");
  const handOff = useRef(false);
  const show = (next: "rename" | "delete") => { handOff.current = true; edit.clearError(); setView(next); setOpen(true); };
  const close = () => { if (!edit.pending) setOpen(false); };
  const actionsLabel = i18n.text(messages.actions);
  return <Popover open={open} onOpenChange={next => { if (!next) close(); }}>
    <ActionMenu>
      <ActionMenuTarget asChild disabled={!edit.ready}>
        <PopoverAnchor asChild><div role="listitem" className="px-1">
          <ListRow className={rowClass} contentClassName="gap-0.5" selected={selected} disabled={!selection.ready}
            title={<span className="truncate">{channel.title}</span>} tooltip={channel.title}
            description={i18n.formatMessage(messages.agents, { count: channel.agents })}
            trailing={selection.pending ? <Spinner className="size-3.5 text-muted-foreground" />
              : selected ? <Check aria-hidden="true" className="size-4 text-primary-text" /> : undefined}
            onOpen={() => {
              if (!selected) void selection.run(() => selection.object.invoke(SelectMeshChannel, { channelId: channel.id }));
            }}
            actions={<TooltipHint content={actionsLabel}><ActionMenuTrigger asChild>
              <ListRowAction aria-label={actionsLabel} disabled={!edit.ready}><MoreHorizontal /></ListRowAction>
            </ActionMenuTrigger></TooltipHint>} />
        </div></PopoverAnchor>
      </ActionMenuTarget>
      <ActionMenuContent align="end" onCloseAutoFocus={event => {
        // The selected item moves focus into the popover; the menu does not take it back.
        if (handOff.current) { event.preventDefault(); handOff.current = false; }
      }}>
        <ActionMenuGroup>
          <ActionMenuItem onSelect={() => show("rename")}><Pencil />{i18n.text(messages.rename)}…</ActionMenuItem>
          <ActionMenuItem variant="destructive" onSelect={() => show("delete")}><Trash2 />{i18n.text(messages.delete)}…</ActionMenuItem>
        </ActionMenuGroup>
      </ActionMenuContent>
    </ActionMenu>
    <PopoverContent align="end" className={popoverClass}>
      {view === "rename"
        ? <ChannelNameForm initial={channel.title} submitLabel={i18n.text(messages.save)} pending={edit.pending} error={edit.error} onCancel={close}
          onSubmit={async title => {
            if (await edit.run(() => edit.object.invoke(RenameMeshChannel, { channelId: channel.id, title }))) setOpen(false);
          }} />
        : <>
          <PopoverHeader>
            <PopoverTitle className="break-words">{i18n.formatMessage(messages.deleteTitle, { title: channel.title })}</PopoverTitle>
            <PopoverDescription>{i18n.text(messages.deleteConfirm)}</PopoverDescription>
          </PopoverHeader>
          <ChannelError error={edit.error} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={edit.pending} onClick={close}>{i18n.text(commonMessages.cancel)}</Button>
            <Button size="sm" variant="destructive" disabled={edit.pending} aria-busy={edit.pending} onClick={async () => {
              if (await edit.run(() => edit.object.invoke(DeleteMeshChannel, { channelId: channel.id }))) setOpen(false);
            }}>{edit.pending && <Spinner />}{i18n.text(messages.delete)}</Button>
          </div>
        </>}
    </PopoverContent>
  </Popover>;
}

export function MeshCard({ data }: { data: MeshCardData }) {
  const i18n = useI18n();
  if (!data.channels.length) return <Empty className="nodrag nopan p-6">
    <EmptyHeader>
      <EmptyMedia variant="icon"><Network /></EmptyMedia>
      <EmptyTitle className="text-sm">{i18n.text(messages.noChannels)}</EmptyTitle>
    </EmptyHeader>
    <EmptyContent><CreateChannel variant="button" /></EmptyContent>
  </Empty>;
  return <ItemGroup aria-label={i18n.text(messages.channels)} className="nodrag nopan min-h-0 flex-1">
    <VirtualList data={data.channels} viewportClassName="py-1">
      {channel => <ChannelRow key={channel.id} channel={channel} selected={channel.id === data.channelId} />}
    </VirtualList>
  </ItemGroup>;
}
