import { useSyncExternalStore } from "react";
import { Bookmark, BookmarkPlus, TextQuote } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@asterism-app/sdk/renderer";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
import { settingsMessages } from "../../settings/contract";
import { savedTextMessages } from "../../messages/saved-text";
import { savedTextName, useSavedText } from "../../saved-text/use-saved-text";
import { useConversationInteraction } from "../conversation/interaction";
import type { CommandContribution, CommandHost } from "./CommandPalette";

/** Inserting and saving composer text; context conditions decide visibility, pending operations only disable. */
export function useSavedTextCommands(host: CommandHost, composerHidden: boolean): CommandContribution {
  const i18n = useI18n();
  const interaction = useConversationInteraction();
  const draft = useSyncExternalStore(interaction.draft.subscribe, interaction.draft.getSnapshot);
  const savedText = useSavedText();
  const { run, busy, error } = useSettingsAction(settingsMessages.saveFailed);
  const canInsert = !composerHidden && interaction.configurable && savedText.ready;
  const pending = draft.locked || draft.uploading;
  return {
    busy,
    error: error ?? savedText.error,
    groups: [{
      id: "saved-text", heading: i18n.text(savedTextMessages.title),
      entries: [{
        id: "saved-text/insert", label: i18n.text(savedTextMessages.insert), icon: <TextQuote />,
        when: canInsert && savedText.items.length > 0, disabled: pending,
        submenu: true, onSelect: () => host.openPage("saved-text"),
      }, {
        id: "saved-text/save-input", label: i18n.text(savedTextMessages.saveInput), icon: <BookmarkPlus />,
        when: savedText.ready && draft.text.trim() !== "",
        onSelect: () => {
          const content = interaction.draft.getSnapshot().text;
          const name = savedTextName(content);
          void run(() => savedText.save({ name, content })).then(result => {
            if (!result) return;
            toast.success(i18n.formatMessage(savedTextMessages.saved, { name }));
            host.close();
          });
        },
      }],
    }],
    pages: {
      "saved-text": {
        id: "saved-text", title: i18n.text(savedTextMessages.title), placeholder: i18n.text(savedTextMessages.search),
        groups: [{
          id: "saved-text/items",
          entries: savedText.items.map(item => ({
            id: `saved-text/${item.id}`, label: item.name, detail: item.content.replace(/\s+/g, " ").trim(),
            icon: <Bookmark />, when: canInsert, disabled: pending,
            onSelect: () => {
              void run(() => interaction.insertSavedText(item.content)).then(result => { if (result?.value) host.close(); });
            },
          })),
        }],
      },
    },
  };
}
