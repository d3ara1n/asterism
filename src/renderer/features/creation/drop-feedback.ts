import type { DropItem, I18n } from "@asterism-app/sdk/renderer";
import { creationMessages } from "../../messages/creation";

/** Report the rejected items, not alternate representations of content that was successfully routed. */
export function describeDropTypes({ formatMessage, locale }: Pick<I18n, "formatMessage" | "locale">,
  items: readonly DropItem[], offeredTypes: readonly string[]): string {
  const labels = items.length ? items.map(item => {
    switch (item.kind) {
      case "file": return item.directory ? formatMessage(creationMessages.droppedDirectory)
        : item.mime ? `${formatMessage(creationMessages.droppedFile)} · ${item.mime}` : formatMessage(creationMessages.droppedFileUnknownType);
      case "text": return `${formatMessage(creationMessages.text)} · text/plain`;
      case "url": return `${formatMessage(creationMessages.droppedLink)} · text/uri-list`;
    }
  }) : offeredTypes.map(type => type === "Files" ? formatMessage(creationMessages.droppedFileUnknownType) : type);
  return new Intl.ListFormat(locale, { type: "unit", style: "short" }).format([...new Set(labels)]);
}
