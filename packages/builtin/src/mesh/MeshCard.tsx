import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Virtualizer, type VirtualizerHandle } from "virtua";
import { Pencil, Plus } from "lucide-react";
import { useI18n, useRendererObject, type RendererReceipt } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Input } from "@asterism-app/ui/ui/input";
import { RadioGroup, RadioGroupItem } from "@asterism-app/ui/ui/radio-group";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@asterism-app/ui/ui/field";
import { ScrollArea } from "@asterism-app/ui/ui/scroll-area";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { cn } from "@asterism-app/ui/utils";
import { CreateMeshChannel, RenameMeshChannel, SelectMeshChannel, type MeshCardData } from "./contract";
import { meshMessages as messages } from "../messages/mesh";
import { channelNavigationIndex } from "./channel-navigation";

export function MeshCard({ data }: { data: MeshCardData }) {
  const object = useRendererObject(), i18n = useI18n(), prefix = useId();
  const [editing, setEditing] = useState<{ channelId: string | null; title: string } | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const disabled = pending || !object.view.ready;
  const scroll = useRef<HTMLDivElement>(null), list = useRef<VirtualizerHandle>(null);
  const radios = useRef(new Map<string, HTMLButtonElement>());
  const requestedFocus = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState(data.channelId);
  const focusRequested = () => {
    if (disabled || !requestedFocus.current) return;
    const button = radios.current.get(requestedFocus.current);
    if (button) { button.focus({ preventScroll: true }); requestedFocus.current = null; }
  };
  useLayoutEffect(focusRequested, [disabled, focusedId]);
  const keepMounted = [...new Set([data.channelId, focusedId].map(id => data.channels.findIndex(channel => channel.id === id)).filter(index => index >= 0))];
  const run = async (work: () => Promise<RendererReceipt>) => {
    if (disabled) return;
    setPending(true); setError(null);
    try {
      const receipt = await work();
      if (!receipt.ok) { setError(receipt.error.display ? i18n.text(receipt.error.display) : i18n.text(messages.failed)); return; }
      setEditing(null);
    } catch (error) {
      console.error("Mesh channel update failed.", error);
      setError(i18n.text(messages.failed));
    } finally { setPending(false); }
  };
  return <ScrollArea viewportRef={scroll} className="nodrag nopan min-h-0 min-w-0 flex-1"
    viewportClassName="[overflow-anchor:none]">
    <div className="flex min-w-0 flex-col">
      <FieldSet disabled={disabled} className="min-w-0 gap-0">
        <FieldLegend variant="label" className="sr-only">{i18n.text(messages.channels)}</FieldLegend>
        <RadioGroup value={data.channelId} disabled={disabled} aria-label={i18n.text(messages.channels)}
          onValueChange={channelId => { void run(() => object.invoke(SelectMeshChannel, { channelId })); }} className="gap-0"
          onKeyDownCapture={event => {
            // Radix's roving collection only knows mounted radios; navigate the full channel list before it handles arrows.
            const target = event.target;
            if (disabled || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !(target instanceof HTMLElement) || !target.matches("[data-slot=radio-group-item]")) return;
            const current = data.channels.findIndex(channel => channel.id === target.dataset.channelId);
            const index = channelNavigationIndex(data.channels.length, current, event.key);
            if (index === null) return;
            event.preventDefault(); event.stopPropagation();
            const channelId = data.channels[index]!.id;
            requestedFocus.current = channelId;
            setFocusedId(channelId);
            list.current?.scrollToIndex(index, { align: "nearest" });
            // Like Radix, arrows select; Home/End/Page keys move focus without changing the checked channel.
            if (!event.key.startsWith("Arrow") || channelId === data.channelId) focusRequested();
            else void run(() => object.invoke(SelectMeshChannel, { channelId }));
          }}>
          <Virtualizer ref={list} scrollRef={scroll} data={data.channels} keepMounted={keepMounted}>
            {(channel, index) => <div key={channel.id} className={cn("px-2 pb-1", index === 0 && "pt-2")}
              onFocusCapture={() => setFocusedId(channel.id)}>
              <Field orientation="horizontal"
                className={cn("min-w-0 gap-2 rounded-md px-2 py-1.5", data.channelId === channel.id && "bg-accent")}>
                <RadioGroupItem id={`${prefix}-${channel.id}`} value={channel.id} data-channel-id={channel.id}
                  aria-setsize={data.channels.length} aria-posinset={index + 1}
                  ref={element => {
                    if (element) { radios.current.set(channel.id, element); focusRequested(); }
                    else radios.current.delete(channel.id);
                  }} />
                <FieldLabel htmlFor={`${prefix}-${channel.id}`} className="min-w-0 flex-1 flex-col items-start gap-0.5 py-1">
                  <TooltipHint content={channel.title}><span className="max-w-full truncate">{channel.title}</span></TooltipHint>
                  <span className="type-caption">{i18n.formatMessage(messages.agents, { count: channel.agents })}</span>
                </FieldLabel>
                <IconButton size="icon-xs" disabled={disabled} label={i18n.text(messages.rename)}
                  onClick={() => { setError(null); setEditing({ channelId: channel.id, title: channel.title }); }}>
                  <Pencil />
                </IconButton>
              </Field>
            </div>}
          </Virtualizer>
        </RadioGroup>
      </FieldSet>
      <div className="flex flex-col gap-2 p-2">
        {editing ? <form onSubmit={event => {
          event.preventDefault();
          const title = editing.title.trim();
          if (!title) return;
          void run(() => editing.channelId === null ? object.invoke(CreateMeshChannel, { title })
            : object.invoke(RenameMeshChannel, { channelId: editing.channelId, title }));
        }}>
          <FieldGroup className="gap-2">
            <Field data-disabled={disabled}>
              <FieldLabel htmlFor={`${prefix}-name`}>{i18n.text(messages.name)}</FieldLabel>
              <Input id={`${prefix}-name`} autoFocus required maxLength={160} disabled={disabled} value={editing.title}
                onChange={event => setEditing({ ...editing, title: event.target.value })} />
            </Field>
            <Field orientation="horizontal" className="gap-2">
              <Button type="submit" size="xs" disabled={disabled || !editing.title.trim()}>
                {pending && <Spinner data-icon="inline-start" />}{i18n.text(editing.channelId === null ? messages.create : messages.save)}
              </Button>
              <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={() => { setEditing(null); setError(null); }}>
                {i18n.text(messages.cancel)}
              </Button>
            </Field>
          </FieldGroup>
        </form> : <Button type="button" variant="ghost" size="xs" className="self-start" disabled={disabled}
          onClick={() => { setError(null); setEditing({ channelId: null, title: "" }); }}>
          {pending ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}{i18n.text(messages.create)}
        </Button>}
        {error && <p role="alert" className="type-caption text-destructive">{error}</p>}
      </div>
    </div>
  </ScrollArea>;
}
