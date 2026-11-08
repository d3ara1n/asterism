import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { useI18n, useRendererIsland, useRendererIslandCancel, useRendererIslandKey } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { Empty, EmptyHeader, EmptyTitle } from "@asterism-app/ui/ui/empty";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { Editor, ReadStatus } from "@asterism-app/ui/configuration-forms";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
import { settingsMessages } from "../settings/contract";
import { savedTextMessages as messages } from "../messages/saved-text";
import { composerTextLimit } from "../agent/conversation/draft";
import { useSavedText } from "./use-saved-text";

const islandKey = (id: string | null) => id === null ? "saved-text:create" : `saved-text:item:${id}`;

export function SavedTextSettings() {
  const i18n = useI18n();
  const savedText = useSavedText();
  const island = useRendererIsland();
  const { run } = useSettingsAction(settingsMessages.saveFailed);
  const open = (id: string | null, origin: HTMLElement) => island.open({
    key: islandKey(id), label: messages.title, origin,
    render: () => <SavedTextEditor key={id ?? "new"} initialId={id} />,
  });
  return <div className="flex flex-col gap-4">
    <div className="flex justify-end">
      <Button size="sm" disabled={!savedText.ready} onClick={event => { void open(null, event.currentTarget); }}>
        <Plus />{i18n.text(messages.add)}
      </Button>
    </div>
    <ReadStatus loaded={savedText.ready} error={savedText.error} onRetry={() => { void run(savedText.refresh); }} />
    {savedText.status === "invalid" && <Alert><AlertDescription>{i18n.text(settingsMessages.invalid)}</AlertDescription></Alert>}
    {savedText.ready && (savedText.items.length === 0
      ? <Empty><EmptyHeader><EmptyTitle>{i18n.text(messages.empty)}</EmptyTitle></EmptyHeader></Empty>
      : <ItemGroup className="surface">
        {savedText.items.map((item, index) => <div key={item.id}>
          {index > 0 && <ItemSeparator />}
          <ListRow title={<span className="truncate">{item.name}</span>} description={item.content}
            selected={island.has(islandKey(item.id))} onOpen={origin => { void open(item.id, origin); }} />
        </div>)}
      </ItemGroup>)}
  </div>;
}

/** A new entry becomes an edit of its stored identity after the first save, keeping the island open. */
function SavedTextEditor({ initialId }: { initialId: string | null }) {
  const i18n = useI18n();
  const nameId = useId(), contentId = useId(), countId = useId();
  const savedText = useSavedText();
  const island = useRendererIsland();
  useRendererIslandCancel(async () => { await island.close(); });
  const { run, busy, error } = useSettingsAction(settingsMessages.saveFailed);
  const [id, setId] = useState(initialId);
  useRendererIslandKey(islandKey(id));
  const stored = id === null ? undefined : savedText.items.find(item => item.id === id);
  const [name, setName] = useState(stored?.name ?? "");
  const [content, setContent] = useState(stored?.content ?? "");
  const dirty = !stored || stored.name !== name.trim() || stored.content !== content;
  const valid = name.trim() !== "" && content.trim() !== "";
  return <Editor form="saved-text-form" title={stored?.name ?? i18n.text(messages.newItem)}
    dirty={dirty} busy={busy} error={error} disabled={!savedText.ready} saveDisabled={!valid}
    remove={stored ? {
      title: i18n.formatMessage(messages.deleteTitle, { name: stored.name }),
      description: i18n.text(messages.deleteDescription),
      onConfirm: () => {
        void run(() => savedText.remove(stored.id)).then(result => { if (result) void island.close({ force: true }); });
      },
    } : undefined}>
    <form id="saved-text-form" onSubmit={event => {
      event.preventDefault();
      if (busy || !valid) return;
      const value = { name: name.trim(), content };
      void run(() => savedText.save(value, id ?? undefined)).then(result => {
        if (!result) return;
        setId(result.value); setName(value.name);
      });
    }}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={nameId}>{i18n.text(messages.name)}</FieldLabel>
          <Input id={nameId} autoFocus required maxLength={160} value={name} onChange={event => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={contentId}>{i18n.text(messages.content)}</FieldLabel>
          <Textarea id={contentId} required maxLength={composerTextLimit} value={content} aria-describedby={countId}
            className="min-h-48 resize-y font-mono text-[13px] leading-relaxed"
            onChange={event => setContent(event.target.value)} />
          <FieldDescription id={countId} className="text-right tabular-nums">
            {i18n.formatMessage(messages.characters, { count: content.length, limit: composerTextLimit })}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  </Editor>;
}
